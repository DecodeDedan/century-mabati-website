import { buildQuote, COLOURS, PRODUCTS } from './quote.js'

const FIELDS = ['name', 'phone', 'product', 'colour', 'length', 'quantity', 'town', 'notes']

function fillSelect(select, options) {
  select.append(...options.map((label) => new Option(label, label)))
}

function showErrors(form, errors) {
  for (const key of FIELDS) {
    // Not form.elements[key]: the "length" field collides with HTMLFormControlsCollection.length.
    const input = form.querySelector(`[name="${key}"]`)
    const message = errors[key] ?? ''
    input.setAttribute('aria-invalid', String(Boolean(message)))
    document.getElementById(`e-${key}`).textContent = message
  }
}

export function initQuoteForm({ scrollTo }) {
  const form = document.getElementById('quote-form')
  const status = form.querySelector('.form-status')
  fillSelect(form.elements.product, PRODUCTS)
  fillSelect(form.elements.colour, COLOURS)

  for (const btn of document.querySelectorAll('[data-quote-product]')) {
    btn.addEventListener('click', () => {
      form.elements.product.value = btn.dataset.quoteProduct
      scrollTo(document.getElementById('quote'))
      form.elements.name.focus({ preventScroll: true })
    })
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const result = buildQuote(Object.fromEntries(new FormData(form)))
    showErrors(form, result.ok ? {} : result.errors)
    if (!result.ok) {
      status.textContent = 'Please fix the highlighted fields.'
      form.querySelector('[aria-invalid="true"]')?.focus()
      return
    }
    window.open(result.url, '_blank', 'noopener')
    // window.open returns null with noopener, so a blocked pop-up is undetectable: always offer the link.
    const link = document.createElement('a')
    link.href = result.url
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'open WhatsApp manually'
    status.replaceChildren('Opening WhatsApp… If nothing happened, ', link, '.')
  })
}
