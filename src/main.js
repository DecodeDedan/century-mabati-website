import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/600.css'
import 'lenis/dist/lenis.css'
import './style.css'
import { initMotion } from './motion.js'
import { initQuoteForm } from './form.js'
import { initTheme } from './theme.js'
import { initNav } from './nav.js'
import { initEstimator, initProductFilter } from './estimator.js'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

initTheme()
const motion = initMotion({ reducedMotion })
initQuoteForm({ scrollTo: motion.scrollTo })
initNav()
initEstimator()
initProductFilter({ onChange: motion.refresh })

document.querySelector('[data-year]').textContent = String(new Date().getFullYear())
