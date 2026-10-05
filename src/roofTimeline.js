// Scroll choreography for the house section: which roof goes on, with which motion, how far along.
// Pure (no DOM/three) so it can be unit-tested.

import { BARE } from './sheetShader.js'

/** Transition styles; the numbers are the uMode values the roof shader switches on. */
export const MODES = { roll: 0, sweep: 1, flip: 2, morph: 3, dissolve: 4 }

export const ROOF_STEPS = [
  { name: 'C-868', profile: 5, color: '#1f4d35', mode: 'roll', motion: 'Rolls down from the ridge' },
  { name: 'C-Wave', profile: 2, color: '#6b1e26', mode: 'sweep', motion: 'Laser-cut sweep, left to right' },
  { name: 'C-800', profile: 3, color: '#c2512e', mode: 'flip', motion: 'Courses flip up from the eaves' },
  { name: 'C-840', profile: 4, color: '#2b2f36', mode: 'morph', motion: 'Re-pressed in place' },
  { name: 'Corrugated', profile: 0, color: '#b3262b', mode: 'roll', motion: 'Rolls down from the ridge' },
  { name: 'Box Profile IT-5', profile: 1, color: '#1f5fa8', mode: 'sweep', motion: 'Laser-cut sweep, left to right' },
  { name: 'Stone-coated Roman', profile: 7, color: '#7a3a2c', mode: 'dissolve', motion: 'Granules settle panel by panel' },
  { name: 'Stone-coated Shake', profile: 6, color: '#34363a', mode: 'flip', motion: 'Courses flip up from the eaves' },
]

export const BARE_COLOR = '#b07a45'
const ENTER = 0.06 // house rises in over the first 6% of the section
const EXIT = 0.94 // and leaves over the last 6%
const TRANSITION_SHARE = 0.55 // of each step's slot; the rest holds the finished roof

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * @param {number} progress 0..1 scroll progress through the section
 * @returns {{index:number, from:number, fromColor:string, to:number, toColor:string, mode:number, t:number, presence:number}}
 *   presence: 0 = house hidden, 1 = fully in place (drives rise-in / exit)
 */
export function roofState(progress) {
  const p = clamp01(progress)
  const presence = Math.min(clamp01(p / ENTER), clamp01((1 - p) / (1 - EXIT)))
  const active = clamp01((p - ENTER) / (EXIT - ENTER))
  const slot = Math.min(active * ROOF_STEPS.length, ROOF_STEPS.length - 1e-6)
  const index = Math.floor(slot)
  const t = easeInOut(clamp01((slot - index) / TRANSITION_SHARE))
  const step = ROOF_STEPS[index]
  const prev = index > 0 ? ROOF_STEPS[index - 1] : null
  return {
    index,
    from: prev ? prev.profile : BARE,
    fromColor: prev ? prev.color : BARE_COLOR,
    to: step.profile,
    toColor: step.color,
    mode: MODES[step.mode],
    t,
    presence: easeInOut(presence),
  }
}
