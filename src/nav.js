// Mobile menu: the header nav collapses behind a toggle below 1100px.
// Closes on link tap, Escape, a tap outside the header, or widening past the breakpoint.

const MOBILE_QUERY = '(max-width: 1100px)'

export function initNav() {
  const header = document.querySelector('.site-header')
  const nav = document.getElementById('site-nav')
  const toggle = document.querySelector('.nav-toggle')
  const isOpen = () => nav.classList.contains('is-open')

  function setOpen(open, { returnFocus = false } = {}) {
    nav.classList.toggle('is-open', open)
    header.classList.toggle('menu-open', open)
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    if (open) nav.querySelector('a')?.focus({ preventScroll: true })
    else if (returnFocus) toggle.focus({ preventScroll: true })
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()))
  // Theme buttons live in the panel too; only links close it.
  nav.addEventListener('click', (e) => {
    if (isOpen() && e.target.closest('a')) setOpen(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, { returnFocus: true })
  })
  document.addEventListener('click', (e) => {
    if (isOpen() && !header.contains(e.target)) setOpen(false)
  })
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => {
    if (!e.matches && isOpen()) setOpen(false)
  })
}
