import { Color, DirectionalLight, DoubleSide, Group, Mesh, MeshPhysicalMaterial, PlaneGeometry, Vector2, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PROFILE_GLSL } from './sheetShader.js'
import { roofState } from './roofTimeline.js'

// The house comes from Blender (blender/build_house.py) with four flat placeholder roof faces.
// Each face is replaced by a dense surface whose vertex shader draws any Century profile and
// blends between two of them with one of five scroll-driven transitions.

const ROOF_SCALE = 0.8 // profile units per metre: tiles drawn ~3x real size so they read on a whole house
const HOUSE_FIT = 0.173 // scene units per metre: the 25 m site fits the stage
const DENSITY = { full: [26, 60], low: [14, 32] } // grid segments per metre [across, up-slope]
const GLOW_BY_MODE = [1.0, 1.5, 0.7, 0.3, 1.2] // roll, sweep, flip, morph, dissolve
// Caps change colour via bare steel; a straight blend (blue to brown) would pass through purple.
const BARE_STEEL = new Color('#a7b0bb')

const VERT_HEADER = /* glsl */ `
uniform float uFrom;
uniform float uTo;
uniform float uT;
uniform float uMode;
uniform float uScale;
uniform vec2 uEave;   // x extent of the eave edge in face space (metres)
uniform vec2 uRidge;  // x extent of the ridge edge (equal for a hip apex)
uniform float uLength; // eave-to-ridge distance
varying vec2 vFacet;
varying float vMask;
varying float vEdge;
varying float vStone;
${PROFILE_GLSL}

// x: how much of the new roof is in place at q; y: extra lift for the course-flip move.
vec2 maskLift(vec2 q) {
  float v = clamp(q.y / uLength, 0.0, 1.0);          // 0 at the eave, 1 at the ridge
  float u = clamp((q.x - uEave.x) / (uEave.y - uEave.x), 0.0, 1.0);
  float t = uT;
  if (uMode < 0.5) {                                  // roll: sheets run down from the ridge
    float e = 1.08 - t * 1.2;
    return vec2(smoothstep(e, e + 0.08, v), 0.0);
  }
  if (uMode < 1.5) {                                  // sweep: laser line crosses left to right
    float e = t * 1.16 - 0.08;
    return vec2(1.0 - smoothstep(e, e + 0.03, u), 0.0);
  }
  if (uMode < 2.5) {                                  // flip: courses lift and turn over, eave first
    float n = 9.0;
    float local = clamp(t * (n + 2.0) - floor(v * n), 0.0, 1.0);
    return vec2(smoothstep(0.42, 0.58, local), sin(PI * local) * 0.32);
  }
  if (uMode < 3.5) return vec2(t, 0.0);              // morph: the whole roof re-presses at once
  float r = hash(floor(q * 1.7));                     // dissolve: panels settle in random order
  return vec2(smoothstep(r - 0.05, r + 0.05, t * 1.12 - 0.06), 0.0);
}

float roofHeight(vec2 q) {
  vec2 ml = maskLift(q);
  vec2 p = q * uScale;
  return mix(profileHeight(uFrom, p), profileHeight(uTo, p), ml.x) / uScale + ml.y;
}

vec3 roofDisplace(vec3 pos, out vec3 n) {
  const float e = 0.006;
  float h = roofHeight(pos.xy);
  float dx = (roofHeight(pos.xy + vec2(e, 0.0)) - h) / e;
  float dy = (roofHeight(pos.xy + vec2(0.0, e)) - h) / e;
  n = normalize(vec3(-dx, -dy, 1.0));
  vec2 ml = maskLift(pos.xy);
  vFacet = pos.xy;
  vMask = ml.x;
  vEdge = 4.0 * ml.x * (1.0 - ml.x);
  vStone = mix(step(5.5, uFrom) * step(uFrom, 7.5), step(5.5, uTo) * step(uTo, 7.5), ml.x);
  return vec3(pos.xy, pos.z + h);
}
`

const FRAG_HEADER = /* glsl */ `
uniform vec2 uEave;
uniform vec2 uRidge;
uniform float uLength;
uniform vec3 uColorFrom;
uniform vec3 uColorTo;
uniform vec3 uGlow;
uniform float uGlowAmt;
varying vec2 vFacet;
varying float vMask;
varying float vEdge;
varying float vStone;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

// Trim the rectangle to this roof face's outline: any quad whose eave and ridge edges are parallel
// (symmetric or not, as on the wing's sides) or a triangle. Hip and valley caps cover the cuts.
const FRAG_CLIP = /* glsl */ `
float fv = clamp(vFacet.y / uLength, 0.0, 1.0);
if (vFacet.x < mix(uEave.x, uRidge.x, fv) || vFacet.x > mix(uEave.y, uRidge.y, fv) || vFacet.y < 0.0 || vFacet.y > uLength) discard;
`

const FRAG_COLOR = /* glsl */ `
// Via bare steel, as the caps and floating sheet do: a straight blend can pass through purple.
const vec3 STEEL = vec3(0.386, 0.429, 0.497);
diffuseColor.rgb = vMask < 0.5 ? mix(uColorFrom, STEEL, vMask * 2.0) : mix(STEEL, uColorTo, vMask * 2.0 - 1.0);
if (vStone > 0.001) {
  float chip = gHash(floor(vFacet * 60.0));
  vec3 stone = diffuseColor.rgb * (0.82 + 0.3 * gHash(floor(vFacet * 3.0))) * (1.0 - 0.3 * chip) + vec3(0.12) * step(0.97, chip);
  diffuseColor.rgb = mix(diffuseColor.rgb, stone, vStone);
}
`

const FRAG_NORMAL = /* glsl */ `
if (vStone > 0.001) {
  vec2 g = floor(vFacet * 60.0);
  normal = normalize(normal + vec3((vec2(gHash(g), gHash(g + 5.1)) - 0.5) * 0.9 * vStone, 0.0));
}
`

function patchRoofMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = VERT_HEADER + shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; vec3 cmDisplaced = roofDisplace(position, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = cmDisplaced;')
    shader.fragmentShader = FRAG_HEADER + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CLIP)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, vStone);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, vStone);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * vEdge * uGlowAmt;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - vStone;\n#endif')
  }
  material.customProgramCacheKey = () => 'century-roof'
}

/**
 * Work out a roof face's frame from its placeholder's world-space corners.
 * Lowest two corners are the eave; the rest are the ridge (two for a trapezoid, one for a hip end).
 */
function facetFrame(mesh) {
  const pos = mesh.geometry.attributes.position
  const seen = new Map()
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
    seen.set(`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`, v)
  }
  const pts = [...seen.values()].sort((a, b) => a.y - b.y)
  if (pts.length < 3) throw new Error(`roof placeholder ${mesh.name} has ${pts.length} corners`)
  const [e0, e1, ...ridge] = pts
  const eaveMid = e0.clone().add(e1).multiplyScalar(0.5)
  const ridgeMid = ridge.reduce((acc, p) => acc.add(p), new Vector3()).multiplyScalar(1 / ridge.length)
  let X = e1.clone().sub(e0).normalize()
  const rise = ridgeMid.clone().sub(eaveMid)
  const Y = rise.clone().sub(X.clone().multiplyScalar(rise.dot(X))).normalize()
  let Z = new Vector3().crossVectors(X, Y)
  if (Z.y < 0) {
    X = X.negate()
    Z = new Vector3().crossVectors(X, Y)
  }
  const local = (p) => p.clone().sub(eaveMid).dot(X)
  const ridgeX = ridge.map(local)
  return {
    origin: eaveMid, X, Y, Z,
    eave: [Math.min(local(e0), local(e1)), Math.max(local(e0), local(e1))],
    ridge: [Math.min(...ridgeX), Math.max(...ridgeX)],
    length: rise.dot(Y),
  }
}

function buildRoofFace(frame, sharedUniforms, density) {
  const x0 = Math.min(frame.eave[0], frame.ridge[0])
  const x1 = Math.max(frame.eave[1], frame.ridge[1])
  const width = x1 - x0
  const geometry = new PlaneGeometry(width, frame.length, Math.ceil(width * density[0]), Math.ceil(frame.length * density[1]))
  geometry.translate((x0 + x1) / 2, frame.length / 2, 0)
  const material = new MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.35, roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.45, side: DoubleSide })
  patchRoofMaterial(material, {
    ...sharedUniforms,
    uEave: { value: new Vector2(...frame.eave) },
    uRidge: { value: new Vector2(...frame.ridge) },
    uLength: { value: frame.length },
  })
  const mesh = new Mesh(geometry, material)
  mesh.matrixAutoUpdate = false
  mesh.matrix.makeBasis(frame.X, frame.Y, frame.Z).setPosition(frame.origin)
  mesh.frustumCulled = false // displacement and course lift reach beyond the flat plane's bounds
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * @param {{url:string, lowPower:boolean}} opts
 * @returns {Promise<{group: Group, update: Function, dispose: Function}>}
 */
export async function loadHouse({ url, lowPower }) {
  const gltf = await new GLTFLoader().loadAsync(url)
  const root = gltf.scene
  root.updateMatrixWorld(true)

  const shared = {
    uFrom: { value: 8 }, uTo: { value: 8 }, uT: { value: 0 }, uMode: { value: 0 }, uScale: { value: ROOF_SCALE },
    uColorFrom: { value: new Color() }, uColorTo: { value: new Color() }, uGlow: { value: new Color('#7cc4ff') }, uGlowAmt: { value: 1 },
  }
  const density = lowPower ? DENSITY.low : DENSITY.full
  const placeholders = []
  const caps = []
  root.traverse((o) => {
    if (!o.isMesh) return
    if (o.name.includes('Roof_')) placeholders.push(o)
    else if (/cap/i.test(o.name)) caps.push(o)
  })
  if (placeholders.length === 0) throw new Error(`no roof placeholders (Roof_*) in ${url}`)
  const capMaterial = caps.length ? caps[0].material.clone() : null
  for (const c of caps) c.material = capMaterial
  const faces = placeholders.map((p) => {
    p.visible = false
    const face = buildRoofFace(facetFrame(p), shared, density)
    root.add(face)
    return face
  })

  root.traverse((o) => {
    if (o.isMesh && o.visible) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })

  const turntable = new Group() // orbit as you scroll
  turntable.add(root)
  const group = new Group() // placement, tilt, rise-in
  group.add(turntable)
  // The sun stays put while the house turns, so shadows sweep across it as you scroll.
  const sun = new DirectionalLight('#fff4e5', 1.4)
  sun.position.set(14, 22, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048)
  // The shadow camera works in world units; the house group is scaled to HOUSE_FIT, so ~25 m of site is ~4.4 units.
  Object.assign(sun.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 0.1, far: 14 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.01
  group.add(sun, sun.target)
  group.visible = false
  const tmpA = new Color()
  const tmpB = new Color()

  function update(progress, elapsed, view) {
    const s = roofState(progress)
    group.visible = progress > 0 && progress < 1 && s.presence > 0.001
    if (!group.visible) return false
    shared.uFrom.value = s.from
    shared.uTo.value = s.to
    shared.uT.value = s.t
    shared.uMode.value = s.mode
    shared.uGlowAmt.value = GLOW_BY_MODE[s.mode]
    shared.uColorFrom.value.set(s.fromColor)
    shared.uColorTo.value.set(s.toColor)
    if (capMaterial) {
      if (s.t < 0.5) capMaterial.color.lerpColors(tmpA.set(s.fromColor), BARE_STEEL, s.t * 2)
      else capMaterial.color.lerpColors(BARE_STEEL, tmpB.set(s.toColor), s.t * 2 - 1)
    }

    const fit = view.portrait ? Math.min(1, view.aspect / 0.62) * 0.68 : 1
    group.scale.setScalar(HOUSE_FIT * fit * (0.85 + 0.15 * s.presence))
    group.position.set(view.portrait ? 0 : view.halfWidth * 0.3, (view.portrait ? 0.55 : -0.95) - (1 - s.presence) * 1.4, 0)
    group.rotation.x = 0.34
    turntable.rotation.y = -0.8 + progress * 1.6 + Math.sin(elapsed * 0.3) * 0.04
    return true
  }

  function dispose() {
    for (const f of faces) {
      f.geometry.dispose()
      f.material.dispose()
    }
    root.traverse((o) => {
      if (o.isMesh && !faces.includes(o)) {
        o.geometry.dispose()
        if (o.material !== capMaterial) o.material.dispose?.()
      }
    })
    capMaterial?.dispose()
  }

  return { group, update, dispose }
}
