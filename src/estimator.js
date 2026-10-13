import { estimateMessage, estimateRoof } from './estimate.js'

const FIELDS = ['length', 'width', 'pitch', 'overhang']
const fmt = (n) => n.toLocaleString('en-KE', { maximumFractionDigits: 1 })

// Recalculates on every keystroke; an error only shows once the visitor has left that field,
// so half-typed numbers don't flash red.
export function initEstimator() {
  const form = document.getElementById('estimate-form')
  const out = Object.fromEntries([...form.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]))
  const hipsRow = form.querySelector('[data-hips]')
  const touched = new Set()

  function render() {
    const e = estimateRoof(Object.fromEntries(new FormData(form)))
    for (const key of FIELDS) {
      const message = touched.has(key) && !e.ok ? e.errors[key] ?? '' : ''
      form.querySelector(`[name="${key}"]`).setAttribute('aria-invalid', String(Boolean(message)))
      document.getElementById(`x-${key}`).textContent = message
    }
    if (!e.ok) {
      for (const k of ['sheet', 'area', 'ridge', 'hips']) out[k].textContent = '—'
      out.note.textContent = 'Check the highlighted measurements.'
      out.whatsapp.setAttribute('aria-disabled', 'true')
      return
    }
    out.sheet.textContent = `${e.sheetLength.toFixed(1)} m`
    out.area.textContent = `${fmt(e.area)} m²`
    out.ridge.textContent = `${fmt(e.ridge)} m`
    out.hips.textContent = `${fmt(e.hips)} m`
    hipsRow.hidden = e.type !== 'hip'
    out.note.textContent = e.overLength
      ? 'Longer than one 12 m sheet: we split it into two with an overlap and advise on the joint.'
      : 'Sheets up to 12 m come in one piece, so this slope needs no joints.'
    out.whatsapp.href = estimateMessage(e).url
    out.whatsapp.removeAttribute('aria-disabled')
  }

  form.addEventListener('input', render)
  form.addEventListener('focusout', (event) => {
    if (FIELDS.includes(event.target.name)) {
      touched.add(event.target.name)
      render()
    }
  })
  form.addEventListener('submit', (event) => event.preventDefault())
  // A link can't be disabled; stop the click instead and show every problem.
  out.whatsapp.addEventListener('click', (event) => {
    if (out.whatsapp.getAttribute('aria-disabled') !== 'true') return
    event.preventDefault()
    FIELDS.forEach((k) => touched.add(k))
    render()
    form.querySelector('[aria-invalid="true"]')?.focus()
  })
  render()
}

// Category chips filter the product grid. Hidden in the HTML so a no-JS visitor sees every product, no dead buttons.
/** @param {{onChange:()=>void}} opts called after the grid changes height */
export function initProductFilter({ onChange }) {
  const group = document.querySelector('.filters')
  const buttons = [...group.querySelectorAll('[data-filter]')]
  const products = [...document.querySelectorAll('.product[data-cat]')]
  group.hidden = false
  group.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter]')
    if (!btn) return
    const cat = btn.dataset.filter
    for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn))
    for (const p of products) p.hidden = cat !== 'all' && p.dataset.cat !== cat
    onChange()
  })
}
