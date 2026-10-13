// Roof geometry for the "Plan your roof" estimator. Pure maths from the customer's measurements:
// how long each sheet must be cut, roof area, and ridge/hip lengths. Sheet counts depend on each
// profile's cover width, so the sales team confirms those on WhatsApp rather than the page guessing.

import { SALES_WHATSAPP } from './quote.js'

export const MAX_SHEET_M = 12
export const ROOF_TYPES = { gable: 'Gable (two slopes)', hip: 'Hip (four slopes)' }

const LIMITS = { length: [2, 100], width: [2, 40], pitch: [5, 60], overhang: [0, 1.5] }
const LABELS = { length: 'Building length', width: 'Building width', pitch: 'Roof pitch', overhang: 'Overhang' }
const UNITS = { length: 'm', width: 'm', pitch: '°', overhang: 'm' }

// Round up to the next 10 cm: a sheet cut short leaves a gap, one cut long just overhangs.
const ceilTo10cm = (m) => Math.ceil(m * 10 - 1e-9) / 10
const round1 = (n) => Math.round(n * 10) / 10

/**
 * @param {Record<string, string|number>} raw form values
 * @returns {{ok:false, errors:Record<string,string>} | {ok:true, type:string, length:number, width:number, pitch:number, overhang:number,
 *   sheetLength:number, area:number, ridge:number, hips:number, overLength:boolean}}
 */
export function estimateRoof(raw) {
  const type = String(raw.type ?? '')
  const v = Object.fromEntries(Object.keys(LIMITS).map((k) => [k, Number(String(raw[k] ?? '').trim() || NaN)]))
  const errors = {}
  if (!Object.hasOwn(ROOF_TYPES, type)) errors.type = 'Choose a roof type.'
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (!Number.isFinite(v[key]) || v[key] < min || v[key] > max) {
      errors[key] = `${LABELS[key]} must be between ${min} and ${max} ${UNITS[key]}.`
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const long = Math.max(v.length, v.width)
  const short = Math.min(v.length, v.width)
  const rad = (v.pitch * Math.PI) / 180
  const run = short / 2 + v.overhang // eaves to ridge, measured flat
  const slope = run / Math.cos(rad)
  const plan = (long + 2 * v.overhang) * (short + 2 * v.overhang)
  const hipEach = Math.hypot(Math.SQRT2 * run, run * Math.tan(rad))

  return {
    ok: true,
    type,
    ...v,
    sheetLength: ceilTo10cm(slope),
    // A uniform-pitch roof's area is its plan area over cos(pitch), whether gable or hip.
    area: Math.ceil(plan / Math.cos(rad) - 1e-9),
    ridge: round1(type === 'gable' ? long + 2 * v.overhang : long - short),
    hips: type === 'hip' ? round1(4 * hipEach) : 0,
    overLength: slope > MAX_SHEET_M,
  }
}

/** @param {Extract<ReturnType<typeof estimateRoof>, {ok:true}>} e */
export function estimateMessage(e) {
  const lines = [
    'Hello Century Mabati, please quote my roof.',
    `Roof: ${ROOF_TYPES[e.type]}, ${e.length} m × ${e.width} m, pitch ${e.pitch}°, overhang ${e.overhang} m`,
    `Sheet length: ${e.sheetLength.toFixed(1)} m${e.overLength ? ' (over 12 m, needs splitting)' : ''}`,
    `Roof area: about ${e.area} m²`,
    `Ridge: ${e.ridge} m${e.hips ? `, hips: ${e.hips} m` : ''}`,
    'Profile and colour: please advise.',
  ]
  const message = lines.join('\n')
  return { message, url: `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}` }
}
