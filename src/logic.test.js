import { describe, expect, test } from 'vitest'
import { blend, locate, NUMERIC_KEYS } from './keyframes.js'
import { buildQuote } from './quote.js'
import { resolveTheme, sanitizeChoice } from './theme.js'
import { MODES, ROOF_STEPS, roofState } from './roofTimeline.js'
import { BARE } from './sheetShader.js'

describe('roofState', () => {
  test('starts on bare battens with the house hidden', () => {
    const s = roofState(0)
    expect(s).toMatchObject({ index: 0, from: BARE, to: ROOF_STEPS[0].profile, t: 0, presence: 0 })
  })

  test('each step transitions, then holds the finished roof before the next', () => {
    const slot = 0.88 / ROOF_STEPS.length // active range is 0.06..0.94
    const holding = roofState(0.06 + slot * 3 + slot * 0.9)
    expect(holding.index).toBe(3)
    expect(holding.t).toBe(1)
    expect(holding.from).toBe(ROOF_STEPS[2].profile)
    expect(holding.mode).toBe(MODES[ROOF_STEPS[3].mode])
    expect(roofState(0.06 + slot * 3 + slot * 0.2).t).toBeLessThan(1)
  })

  test('ends on the last profile and clamps out-of-range progress', () => {
    const end = roofState(5)
    expect(end.index).toBe(ROOF_STEPS.length - 1)
    expect(end.presence).toBe(0)
    expect(roofState(-1)).toMatchObject({ index: 0, t: 0 })
  })

  test('the house is fully present through the middle of the section', () => {
    expect(roofState(0.5).presence).toBe(1)
  })
})

describe('theme', () => {
  test('system follows the device preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  test('an explicit choice overrides the device', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  test('unknown or missing stored values fall back to system', () => {
    expect(sanitizeChoice(null)).toBe('system')
    expect(sanitizeChoice('purple')).toBe('system')
    expect(sanitizeChoice('dark')).toBe('dark')
  })
})

const anchors = [{ pos: 0 }, { pos: 100 }, { pos: 300 }]

describe('locate', () => {
  test('clamps above the first and below the last anchor', () => {
    expect(locate(anchors, -50)).toEqual({ a: 0, b: 0, t: 0 })
    expect(locate(anchors, 999)).toEqual({ a: 2, b: 2, t: 0 })
  })

  test('finds the bracketing pair with eased progress', () => {
    const r = locate(anchors, 200)
    expect([r.a, r.b]).toEqual([1, 2])
    expect(r.t).toBeCloseTo(0.5)
    expect(locate(anchors, 125).t).toBeLessThan(0.125) // eased start is slower than linear
  })

  test('survives anchors that collapse to the same position', () => {
    expect(locate([{ pos: 0 }, { pos: 0 }, { pos: 10 }], 5)).toMatchObject({ a: 1, b: 2 })
  })

  test('throws when there are no anchors', () => {
    expect(() => locate([], 0)).toThrow()
  })
})

describe('blend', () => {
  const base = Object.fromEntries(NUMERIC_KEYS.map((k) => [k, 0]))
  test('interpolates numbers and passes profile/colour pairs through', () => {
    const out = blend({ ...base, x: 0, profile: 1, color: '#000' }, { ...base, x: 10, profile: 4, color: '#fff' }, 0.25)
    expect(out.x).toBe(2.5)
    expect(out).toMatchObject({ profileA: 1, profileB: 4, profileMix: 0.25, colorA: '#000', colorB: '#fff' })
  })
})

describe('buildQuote', () => {
  const valid = { name: 'Wanjiku', phone: '0712 345 678', product: 'C-Wave', colour: 'Maroon', length: '3.5', quantity: '40', town: 'Molo', notes: '' }

  test('builds a WhatsApp link with the full enquiry', () => {
    const r = buildQuote(valid)
    expect(r.ok).toBe(true)
    expect(r.url.startsWith('https://wa.me/254718035476?text=')).toBe(true)
    expect(r.message).toContain('Sheet length: 3.5 m')
    expect(r.message).toContain('Delivery to: Molo')
    expect(r.message).not.toContain('Notes:')
  })

  test('accepts +254 numbers and an empty optional phone', () => {
    expect(buildQuote({ ...valid, phone: '+254 712-345-678' }).ok).toBe(true)
    expect(buildQuote({ ...valid, phone: '' }).ok).toBe(true)
  })

  test('rejects out-of-range length, fractional quantity and unknown product', () => {
    const r = buildQuote({ ...valid, length: '12.5', quantity: '2.5', product: 'Gold' })
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['length', 'product', 'quantity'])
  })

  test('rejects blank name, bad phone and oversized notes', () => {
    const r = buildQuote({ ...valid, name: ' ', phone: '12345', notes: 'x'.repeat(301) })
    expect(Object.keys(r.errors).sort()).toEqual(['name', 'notes', 'phone'])
  })

  test('accepts the 12 m boundary', () => {
    expect(buildQuote({ ...valid, length: '12' }).ok).toBe(true)
  })
})
