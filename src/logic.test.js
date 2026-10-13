import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildQuote, PRODUCTS } from './quote.js'
import { resolveTheme, sanitizeChoice } from './theme.js'
import { estimateMessage, estimateRoof } from './estimate.js'

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

describe('buildQuote', () => {
  const valid = { name: 'Wanjiku', phone: '0712 345 678', product: 'Wavetile', colour: 'Maroon', length: '3.5', quantity: '40', town: 'Molo', notes: '' }

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

describe('product cards', () => {
  test('every "Get a quote" button preselects a product the form offers', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const names = [...html.matchAll(/data-quote-product="([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBe(10)
    for (const name of names) expect(PRODUCTS).toContain(name)
  })
})

describe('estimateRoof', () => {
  const house = { type: 'gable', length: '10', width: '8', pitch: '25', overhang: '0.5' }

  test('gable: sheet cut to the slope, area over cos(pitch), ridge spans the overhangs', () => {
    const e = estimateRoof(house)
    expect(e).toMatchObject({ ok: true, sheetLength: 5, area: 110, ridge: 11, hips: 0, overLength: false })
  })

  test('hip: same area and sheet length, short ridge plus four hips', () => {
    const e = estimateRoof({ ...house, type: 'hip' })
    expect(e).toMatchObject({ sheetLength: 5, area: 110, ridge: 2, hips: 26.8 })
  })

  test('width and length can be entered either way round', () => {
    expect(estimateRoof({ ...house, length: '8', width: '10' })).toMatchObject({ sheetLength: 5, ridge: 11 })
  })

  test('flags slopes longer than a 12 m sheet', () => {
    expect(estimateRoof({ ...house, length: '30', width: '25', pitch: '30' }).overLength).toBe(true)
  })

  test('accepts a zero overhang and rejects blanks, out-of-range values and unknown roof types', () => {
    expect(estimateRoof({ ...house, overhang: '0' }).ok).toBe(true)
    const r = estimateRoof({ type: 'dome', length: '', width: '41', pitch: '4', overhang: '2' })
    expect(Object.keys(r.errors).sort()).toEqual(['length', 'overhang', 'pitch', 'type', 'width'])
  })

  test('builds a WhatsApp message with the measurements and results', () => {
    const { message, url } = estimateMessage(estimateRoof({ ...house, type: 'hip' }))
    expect(url.startsWith('https://wa.me/254718035476?text=')).toBe(true)
    expect(message).toContain('Hip (four slopes), 10 m × 8 m, pitch 25°')
    expect(message).toContain('Sheet length: 5.0 m')
    expect(message).toContain('hips: 26.8 m')
  })
})
