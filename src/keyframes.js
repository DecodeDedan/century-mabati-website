// Scroll choreography for the WebGL sheet. Each anchor pins a scene state to a
// document Y position; the sheet interpolates between the two anchors that
// bracket the viewport centre. Kept free of DOM/three so it is unit-testable.

// py is the y position used on portrait screens, where the sheet is centred horizontally.
export const NUMERIC_KEYS = ['x', 'y', 'py', 'z', 'rx', 'ry', 'rz', 'scale', 'reveal', 'wire', 'scan', 'rough', 'metal']

export const smoothstep = (t) => t * t * (3 - 2 * t)

export const clamp01 = (t) => Math.min(1, Math.max(0, t))

export const lerp = (a, b, t) => a + (b - a) * t

/**
 * @param {{pos:number}[]} anchors sorted ascending by pos
 * @param {number} y document position of the viewport centre
 * @returns {{a:number, b:number, t:number}} indices of bracketing anchors + eased mix
 */
export function locate(anchors, y) {
  if (anchors.length === 0) throw new Error('locate: no anchors')
  const last = anchors.length - 1
  if (y <= anchors[0].pos) return { a: 0, b: 0, t: 0 }
  if (y >= anchors[last].pos) return { a: last, b: last, t: 0 }
  let i = 0
  while (anchors[i + 1].pos < y) i++
  const span = anchors[i + 1].pos - anchors[i].pos
  const t = span <= 0 ? 1 : clamp01((y - anchors[i].pos) / span)
  return { a: i, b: i + 1, t: smoothstep(t) }
}

/** Blend two scene states. Profile ids and colours are returned as from/to pairs for the GPU. */
export function blend(sa, sb, t) {
  const out = { profileA: sa.profile, profileB: sb.profile, profileMix: t, colorA: sa.color, colorB: sb.color, colorMix: t }
  for (const k of NUMERIC_KEYS) out[k] = lerp(sa[k], sb[k], t)
  return out
}
