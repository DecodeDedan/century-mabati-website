import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

const HEADER_OFFSET = -72

// All hidden start states are written here at runtime, never in CSS, so the
// page is complete and readable if this module never loads.
export function initMotion({ reducedMotion }) {
  if (reducedMotion) {
    return { scrollTo: (el) => el.scrollIntoView({ block: 'start' }), refresh: () => {} }
  }

  gsap.registerPlugin(ScrollTrigger)
  // Phone address bars resize the viewport mid-scroll; re-measuring then would make pinned rails jump.
  ScrollTrigger.config({ ignoreMobileResize: true })
  const lenis = new Lenis({ autoRaf: false, lerp: 0.09, anchors: { offset: HEADER_OFFSET } })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  gsap.fromTo('.progress span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } })

  // The factory photo is the LCP element and the H1 sits on it: neither is ever hidden; only the copy around them animates in.
  gsap.from('[data-hero]', { y: 24, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', delay: 0.1 })
  // Scroll-only drift: the photo starts in place, so it paints at full strength before any JS runs.
  // Desktop only: on phones the photo sits in the flow above the copy, so drifting it would cover the headline.
  gsap.matchMedia().add('(min-width: 901px)', () => {
    gsap.to('.hero-bg', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
  })

  splitHeadings()
  revealOnEnter()
  parallax()
  // Phones: products slide sideways as you scroll down; the factory strip does on every screen size.
  horizontalScroll('.product-rail', '.product-grid', '(max-width: 900px)')
  horizontalScroll('.strip-wrap', '.strip', 'all')

  // Pinned sections below the product grid must be re-measured when a filter changes its height.
  return { scrollTo: (el) => lenis.scrollTo(el, { offset: HEADER_OFFSET }), refresh: () => ScrollTrigger.refresh() }
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

// Pins the rail while vertical scroll slides its track sideways by exactly the track's overflow.
// Without JS or with reduced motion the rail stays a native swipeable row (see .is-pinned-rail in CSS).
function horizontalScroll(railSelector, trackSelector, query) {
  const rail = document.querySelector(railSelector)
  const track = document.querySelector(trackSelector)
  if (!rail || !track) return
  const distance = () => {
    // Measured from the last visible item so product filters change the travel too.
    const items = [...track.children].filter((el) => el.offsetWidth > 0)
    const last = items.at(-1)
    if (!last) return 0
    const gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0
    return Math.max(0, last.offsetLeft + last.offsetWidth + gutter - rail.clientWidth)
  }
  gsap.matchMedia().add(query, () => {
    rail.classList.add('is-pinned-rail')
    gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: { trigger: rail, start: 'center center', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true },
    })
    return () => rail.classList.remove('is-pinned-rail')
  })
}
