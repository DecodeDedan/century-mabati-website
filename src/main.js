import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import 'lenis/dist/lenis.css'
import './style.css'
import { initMotion } from './motion.js'
import { initQuoteForm } from './form.js'
import { initTheme } from './theme.js'
import { initNav } from './nav.js'
import { roofState } from './roofTimeline.js'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (reducedMotion) document.documentElement.classList.add('reduced-motion')
const lowPower = window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4

const hud = {
  profile: document.querySelector('[data-hud="profile"]'),
  length: document.querySelector('[data-hud="length"]'),
  color: document.querySelector('[data-hud="color"]'),
  chip: document.querySelector('[data-hud="chip"]'),
  forge: document.querySelector('[data-forge-count]'),
}

function updateHud({ profile, length, color }) {
  hud.profile.textContent = profile
  hud.length.textContent = `${length.toFixed(2)} m`
  hud.color.textContent = color
  hud.chip.style.background = color
  hud.forge.textContent = length.toFixed(2)
}

// three.js is the bulk of the bundle; load it after the page is interactive.
let scene = null
let STATES = {}
const theme = initTheme({ onChange: (t) => scene?.setTheme(t) })

function computeAnchors() {
  if (!scene) return
  const anchors = [...document.querySelectorAll('[data-scene]')]
    .map((el) => {
      const r = el.getBoundingClientRect()
      return { pos: r.top + window.scrollY + r.height / 2, state: STATES[el.dataset.scene] }
    })
    .filter((a) => a.state)
    .sort((a, b) => a.pos - b.pos)
  scene.setAnchors(anchors)
  scene.setScroll(window.scrollY + window.innerHeight / 2, { jump: true })
}

const noWebgl = () => document.documentElement.classList.add('no-webgl')

async function startScene() {
  let mod
  try {
    mod = await import('./scene.js')
  } catch (err) {
    console.error('[main] failed to load 3D scene', err)
    noWebgl()
    return
  }
  STATES = mod.STATES
  scene = mod.createScene(document.getElementById('gl'), { reducedMotion, lowPower, theme: theme.current(), onFrame: updateHud, onLost: noWebgl })
  if (!scene) {
    noWebgl()
    return
  }
  window.addEventListener('scroll', () => scene.setScroll(window.scrollY + window.innerHeight / 2), { passive: true })
  window.addEventListener('pointermove', (e) => scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1), { passive: true })
  // Lazy images and fonts shift section positions after load; re-measure on any body resize.
  let queued = false
  new ResizeObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      computeAnchors()
    })
  }).observe(document.body)
  computeAnchors()
  syncRoof()
  // The house model is ~1.7 MB with its textures: fetch it only as the section approaches.
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    scene.loadHouse('/models/century-house.glb').catch(() => noWebglRoof())
  }, { rootMargin: '150% 0px' }).observe(document.getElementById('roof'))
  // Apply a swatch picked while the scene was still loading.
  const picked = document.querySelector('[data-swatch][aria-pressed="true"]')?.dataset.swatch
  if (picked) scene.setColorOverride(picked)
}
startScene()

// House section: page scroll progress drives which roof is going on; the list names it.
const roofSection = document.getElementById('roof')
const roofItems = [...roofSection.querySelectorAll('.roof-steps li')]
let roofIndex = -1

function roofProgress() {
  const r = roofSection.getBoundingClientRect()
  return -r.top / Math.max(1, r.height - window.innerHeight)
}

function syncRoof() {
  const p = roofProgress()
  scene?.setHouseProgress(p)
  const index = roofState(p).index
  if (index === roofIndex) return
  roofIndex = index
  roofItems.forEach((li, i) => {
    li.classList.toggle('is-current', i === index)
    li.classList.toggle('is-done', i < index)
    if (i === index) li.setAttribute('aria-current', 'step')
    else li.removeAttribute('aria-current')
  })
}

// If the model can't load, fall back to the photo layout for this section only.
function noWebglRoof() {
  roofSection.classList.add('roof-static')
}

window.addEventListener('scroll', syncRoof, { passive: true })
syncRoof()

// The HUD narrates the sheet only where the sheet is the subject; elsewhere it would cover copy.
// Steps are observed individually so the HUD stays hidden over the profiles intro.
const hudEl = document.querySelector('.hud')
const hudVisible = new Map()
const hudIO = new IntersectionObserver((entries) => {
  for (const e of entries) hudVisible.set(e.target, e.isIntersecting)
  hudEl.classList.toggle('is-on', [...hudVisible.values()].some(Boolean))
}, { rootMargin: '-40% 0px -40% 0px' })
for (const el of document.querySelectorAll('#forge, .profile-step')) hudIO.observe(el)

// Colour swatches recolour the live sheet; "Auto" returns to each section's own finish.
const swatches = [...document.querySelectorAll('[data-swatch]')]
for (const btn of swatches) {
  btn.addEventListener('click', () => {
    for (const s of swatches) {
      const on = s === btn
      s.setAttribute('aria-pressed', String(on))
      s.classList.toggle('is-active', on)
    }
    scene?.setColorOverride(btn.dataset.swatch || null)
  })
}

const motion = initMotion({ reducedMotion, onRefresh: computeAnchors })
initQuoteForm({ scrollTo: motion.scrollTo })
initNav()

document.querySelector('[data-year]').textContent = String(new Date().getFullYear())
