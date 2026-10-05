import {
  ACESFilmicToneMapping, AdditiveBlending, PCFSoftShadowMap, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, Group,
  MeshBasicMaterial, MeshPhysicalMaterial, Mesh, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Points, PointsMaterial,
  Scene, SRGBColorSpace, Timer, WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { blend, locate } from './keyframes.js'
import { PROFILES, SHEET, patchSheetMaterial } from './sheetShader.js'
import { loadHouse as loadHouseModel } from './house.js'

const CAMERA_Z = 8
const DESIGN_HALF_WIDTH = 4 // keyframe x values are authored for a ~16:10 viewport
const SCROLL_SMOOTHING = 7
const HIDDEN_SCALE = 0.02
// Colour changes pass through bare steel, as if the sheet is stripped and
// re-coated; a direct RGB blend from red to blue would detour through purple.
const BARE_STEEL = new Color('#a7b0bb')
// Per-theme look. Painted steel photographs darker than ACES renders it at exposure 1.0,
// so light mode runs lower; on a dark page the sheet needs more light to read as steel.
const THEME_LOOK = {
  light: { dust: '#1b2b4b', dustOpacity: 0.45, exposure: 0.82, env: 0.75 },
  dark: { dust: '#9fb6d3', dustOpacity: 0.35, exposure: 0.92, env: 0.9 },
}

// Scene states keyed by the data-scene attribute on page elements.
// x is authored in "desktop units" and rescaled to the live aspect ratio.
const base = { x: 0, y: 0, py: 1.1, z: 0, rx: -0.95, ry: 0.3, rz: 0.5, scale: 1, reveal: 1, wire: 0, scan: 0, rough: 0.48, metal: 0.35 }
const p = (id, extra = {}) => ({ ...base, x: -1.55, y: -0.1, rx: -0.9, ry: -0.35, rz: -0.45, scale: 0.95, profile: id, color: PROFILES[id].color, rough: id >= 6 ? 0.95 : 0.48, metal: id >= 6 ? 0 : 0.35, ...extra })
const hidden = { ...base, x: 3.2, y: 2.4, rz: 1.2, scale: 0.001, profile: 1, color: '#8c96a3' }

export const STATES = {
  hero: { ...base, x: 1.65, y: -0.25, rz: 0.55, scale: 1.05, profile: 2, color: '#6b1e26', scan: 0.2 },
  'forge-start': { ...base, x: 0.2, y: -1.0, py: -0.7, rx: -1.32, ry: 0, rz: 1.5708, scale: 1.05, profile: 1, color: '#1f5fa8', reveal: 0.06, scan: 0 },
  'forge-end': { ...base, x: 0.2, y: -1.0, py: -0.7, rx: -1.25, ry: 0.12, rz: 1.5708, scale: 1.05, profile: 1, color: '#1f5fa8', reveal: 1, scan: 0 },
  p0: p(0), p1: p(1), p2: p(2), p3: p(3), p4: p(4), p5: p(5),
  // Stone-coated is framed closer and flatter so the granule texture reads.
  p6: p(6, { z: 0.7, rx: -1.0, rz: -0.4 }), p7: p(7, { z: 0.7, rx: -1.0, rz: -0.4 }),
  factory: { ...base, x: 1.85, y: 0, rx: -1.1, ry: 0.1, rz: 0.9, scale: 0.9, profile: 1, color: '#8c96a3', wire: 1, scan: 0.7, rough: 0.22, metal: 0.9 },
  projects: hidden,
  why: { ...base, x: -1.75, y: 0, rx: -0.8, ry: -0.2, rz: -0.6, scale: 0.85, profile: 3, color: '#c2512e' },
  accessories: hidden,
  contact: hidden, // the form and map fill the viewport; nothing to float beside
  roof: hidden, // the house takes the stage
}

function makeParticles(count) {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  const mat = new PointsMaterial({ color: '#1b2b4b', size: 0.022, transparent: true, opacity: 0.45, depthWrite: false })
  return new Points(geo, mat)
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{reducedMotion:boolean, lowPower:boolean, theme?:'light'|'dark', onLost:()=>void, onFrame:(hud:object)=>void}} opts
 * @returns {null | {setAnchors:Function, setScroll:Function, setPointer:Function, setTheme:Function, setColorOverride:Function, dispose:Function}}
 */
export function createScene(canvas, { reducedMotion, lowPower, theme = 'light', onLost, onFrame }) {
  let renderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' })
  } catch (err) {
    console.warn('[scene] WebGL unavailable, using static fallback', err)
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)
  // Shadows are only cast by the house (its own sun); the floating sheet stays unshadowed.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 50)
  camera.position.set(0, 0, CAMERA_Z)

  const pmrem = new PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = envRT.texture
  pmrem.dispose()

  const key = new DirectionalLight('#ffffff', 1.6)
  key.position.set(3, 5, 6)
  scene.add(key)

  const uniforms = {
    uProfileA: { value: 2 }, uProfileB: { value: 2 }, uProfileMix: { value: 0 },
    uReveal: { value: 1 }, uScan: { value: 0 }, uTime: { value: 0 }, uGlow: { value: new Color('#7cc4ff') },
  }

  // Enough x resolution for IT-5 webs and pan stiffeners; enough y for crisp tile steps.
  const seg = lowPower ? [180, 420] : [340, 720]
  const sheetGeo = new PlaneGeometry(SHEET.width, SHEET.length, seg[0], seg[1])
  const sheetMat = new MeshPhysicalMaterial({ color: '#6b1e26', metalness: 0.35, roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.45, side: DoubleSide })
  patchSheetMaterial(sheetMat, uniforms, { lit: true })
  const sheet = new Mesh(sheetGeo, sheetMat)

  const wireGeo = new PlaneGeometry(SHEET.width, SHEET.length, 40, 100)
  wireGeo.translate(0, 0, 0.015)
  const wireMat = new MeshBasicMaterial({ color: '#2e8bdc', wireframe: true, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending })
  patchSheetMaterial(wireMat, uniforms, { lit: false })
  const wire = new Mesh(wireGeo, wireMat)

  const rig = new Group() // pointer + idle motion
  const body = new Group() // scroll-driven pose
  body.add(sheet, wire)
  rig.add(body)
  scene.add(rig)

  const particles = makeParticles(lowPower ? 260 : 700)
  scene.add(particles)

  let anchors = [{ pos: 0, state: STATES.hero }]
  let targetY = 0
  let smoothY = 0
  let colorOverride = null
  let aspect = 1
  let wasHidden = false
  let house = null
  let houseTarget = -1 // section progress from the page; <0 or >1 means off-stage
  let houseSmooth = -1
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  const tmpA = new Color()
  const tmpB = new Color()
  const timer = new Timer()
  let lastHud = ''

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    aspect = w / h
    renderer.setSize(w, h, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }

  function apply(s) {
    const halfWidth = CAMERA_Z * Math.tan((camera.fov * Math.PI) / 360) * aspect
    const fit = Math.min(1, Math.max(0.55, aspect / 1.4))
    const portrait = aspect < 0.9
    body.position.set(portrait ? 0 : (s.x * halfWidth) / DESIGN_HALF_WIDTH, portrait ? s.py : s.y, s.z)
    body.rotation.set(s.rx, s.ry, s.rz)
    body.scale.setScalar(Math.max(0.0001, s.scale * fit))

    uniforms.uProfileA.value = s.profileA
    uniforms.uProfileB.value = s.profileB
    uniforms.uProfileMix.value = s.profileMix
    uniforms.uReveal.value = s.reveal
    uniforms.uScan.value = s.scan
    if (colorOverride) sheetMat.color.set(colorOverride)
    else if (s.colorMix < 0.5) sheetMat.color.lerpColors(tmpA.set(s.colorA), BARE_STEEL, s.colorMix * 2)
    else sheetMat.color.lerpColors(BARE_STEEL, tmpB.set(s.colorB), s.colorMix * 2 - 1)
    sheetMat.roughness = s.rough
    sheetMat.metalness = s.metal
    wireMat.opacity = s.wire * 0.55
    wire.visible = s.wire > 0.01

    const dominant = s.profileMix < 0.5 ? s.profileA : s.profileB
    const color = '#' + sheetMat.color.getHexString()
    const hud = `${dominant}|${(s.reveal * 12).toFixed(2)}|${color}`
    if (hud !== lastHud) {
      lastHud = hud
      onFrame({ profile: PROFILES[dominant].name, length: s.reveal * 12, color })
    }
    return s.scale
  }

  function stateAt(y) {
    const { a, b, t } = locate(anchors, y)
    return blend(anchors[a].state, anchors[b].state, t)
  }

  function frame(time) {
    timer.update(time)
    const dt = Math.min(timer.getDelta(), 0.1)
    const elapsed = timer.getElapsed()
    smoothY += (targetY - smoothY) * (1 - Math.exp(-dt * SCROLL_SMOOTHING))
    const scale = apply(stateAt(smoothY))

    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 4))
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 4))
    rig.rotation.set(pointer.sy * 0.12, pointer.sx * 0.18 + Math.sin(elapsed * 0.3) * 0.06, 0)
    rig.position.y = Math.sin(elapsed * 0.6) * 0.05
    uniforms.uTime.value = elapsed
    particles.rotation.y = elapsed * 0.015
    particles.position.y = smoothY * 0.0006

    // The house section eases toward the page's scroll progress, like the sheet does.
    houseSmooth = houseTarget < 0 || houseTarget > 1 ? houseTarget : houseSmooth + (houseTarget - houseSmooth) * (1 - Math.exp(-dt * SCROLL_SMOOTHING))
    const halfWidth = CAMERA_Z * Math.tan((camera.fov * Math.PI) / 360) * aspect
    const houseOn = house ? house.update(houseSmooth, elapsed, { aspect, halfWidth, portrait: aspect < 0.9 }) : false

    // Nothing visible but dust: render once more to clear the sheet, then idle.
    const hiddenNow = scale < HIDDEN_SCALE && !houseOn
    if (hiddenNow && wasHidden) return
    wasHidden = hiddenNow
    renderer.render(scene, camera)
  }

  function renderStill() {
    apply(blend(STATES.hero, STATES.hero, 0))
    renderer.render(scene, camera)
  }

  const onResize = () => {
    resize()
    if (reducedMotion) renderStill()
  }
  const onContextLost = (e) => {
    e.preventDefault()
    console.warn('[scene] WebGL context lost, switching to static fallback')
    dispose()
    onLost()
  }

  function dispose() {
    renderer.setAnimationLoop(null)
    window.removeEventListener('resize', onResize)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    sheetGeo.dispose(); sheetMat.dispose(); wireGeo.dispose(); wireMat.dispose()
    particles.geometry.dispose(); particles.material.dispose()
    envRT.dispose()
    house?.dispose()
    renderer.dispose()
  }

  function applyTheme(name) {
    const look = THEME_LOOK[name] ?? THEME_LOOK.light
    particles.material.color.set(look.dust)
    particles.material.opacity = look.dustOpacity
    renderer.toneMappingExposure = look.exposure
    scene.environmentIntensity = look.env
  }

  window.addEventListener('resize', onResize)
  canvas.addEventListener('webglcontextlost', onContextLost)
  applyTheme(theme)
  resize()
  if (reducedMotion) renderStill()
  else renderer.setAnimationLoop(frame)

  return {
    setAnchors(next) {
      if (next.length) anchors = next
    },
    setScroll(y, { jump = false } = {}) {
      targetY = y
      if (jump) smoothY = y
    },
    setPointer(nx, ny) {
      pointer.x = nx
      pointer.y = ny
    },
    setTheme(next) {
      applyTheme(next)
      wasHidden = false
      if (reducedMotion) renderStill()
    },
    /** 0..1 progress through the house section; anything else hides the house. */
    setHouseProgress(p) {
      if (houseSmooth < 0 || houseSmooth > 1) houseSmooth = Math.min(1, Math.max(0, p)) // snap on entry, ease after
      houseTarget = p
    },
    async loadHouse(url) {
      if (reducedMotion || house) return
      try {
        house = await loadHouseModel({ url, lowPower })
        scene.add(house.group)
      } catch (err) {
        console.error('[scene] house model failed to load; the section keeps its photo', err)
        throw err
      }
    },
    setColorOverride(hex) {
      colorOverride = hex
      wasHidden = false
      if (reducedMotion) renderStill()
    },
    dispose,
  }
}
