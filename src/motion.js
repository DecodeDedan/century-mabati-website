import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

const HEADER_OFFSET = -72

// All hidden start states are written here at runtime, never in CSS, so the
// page is complete and readable if this module never loads.
export function initMotion({ reducedMotion, onRefresh }) {
  const header = document.querySelector('.site-header')
  const syncHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 40)
  window.addEventListener('scroll', syncHeader, { passive: true })
  syncHeader()

  if (reducedMotion) {
    return { scrollTo: (el) => el.scrollIntoView({ block: 'start' }) }
  }

  gsap.registerPlugin(ScrollTrigger)
  const lenis = new Lenis({ autoRaf: false, lerp: 0.09, anchors: { offset: HEADER_OFFSET } })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
  ScrollTrigger.addEventListener('refresh', onRefresh)

  gsap.fromTo('.progress span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } })

  // The H1 is the LCP element, so it is never hidden; only its neighbours animate in.
  gsap.from('[data-hero]', { y: 24, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', delay: 0.1 })
  gsap.from('#gl', { opacity: 0, duration: 1.4, ease: 'power2.out' })

  splitHeadings()
  revealOnEnter()
  parallax()
  factoryStrip()

  return { scrollTo: (el) => lenis.scrollTo(el, { offset: HEADER_OFFSET }) }
}

function splitHeadings() {
  for (const heading of document.querySelectorAll('[data-split]')) {
    const text = heading.textContent.trim()
    heading.setAttribute('aria-label', text)
    const words = text.split(/\s+/).map((word) => {
      const line = document.createElement('span')
      line.className = 'split-line'
      line.setAttribute('aria-hidden', 'true')
      const inner = document.createElement('span')
      inner.className = 'split-word'
      inner.textContent = word
      line.append(inner)
      return line
    })
    heading.replaceChildren(...words.flatMap((w, i) => (i ? [' ', w] : [w])))
    gsap.from(heading.querySelectorAll('.split-word'), {
      yPercent: 110, duration: 1, stagger: 0.05, ease: 'power4.out',
      scrollTrigger: { trigger: heading, start: 'top 88%', once: true },
    })
  }
}

function revealOnEnter() {
  const items = gsap.utils.toArray('[data-reveal]')
  gsap.set(items, { y: 40, opacity: 0 })
  const show = (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out', overwrite: true })
  // onLeave covers items already scrolled past when the page loads mid-way down.
  ScrollTrigger.batch(items, { start: 'top 90%', once: true, onEnter: show, onLeave: show })
}

function parallax() {
  for (const img of gsap.utils.toArray('[data-parallax] img')) {
    gsap.fromTo(img, { yPercent: -8 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    })
  }
}

function factoryStrip() {
  const strip = document.querySelector('.strip')
  const distance = () => Math.max(0, strip.scrollWidth - window.innerWidth)
  gsap.matchMedia().add('(min-width: 901px)', () => {
    gsap.to(strip, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: { trigger: '.strip-wrap', start: 'center center', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true },
    })
  })
}
