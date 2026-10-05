// Theme choice: "system" follows the device, "light"/"dark" override it.
// The inline script in index.html applies a saved choice before first paint;
// this module owns the switch, persistence and telling the 3D scene.

export const THEME_KEY = 'cm-theme'
export const CHOICES = ['system', 'light', 'dark']
const META_COLOR = { light: '#eef1f4', dark: '#0d1219' }

/** Anything unexpected in storage falls back to following the device. */
export const sanitizeChoice = (value) => (CHOICES.includes(value) ? value : 'system')

/** @returns {'light'|'dark'} */
export const resolveTheme = (choice, prefersDark) => (choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice)

function readChoice() {
  try {
    return sanitizeChoice(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system' // storage blocked (private mode, cookies off): still works, just not remembered
  }
}

function saveChoice(choice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Storage blocked: the choice applies for this visit only, which is the best available.
  }
}

/**
 * @param {{onChange:(theme:'light'|'dark')=>void}} opts
 * @returns {{current:()=>'light'|'dark'}}
 */
export function initTheme({ onChange }) {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const buttons = [...document.querySelectorAll('[data-theme-choice]')]
  const meta = document.querySelector('meta[name="theme-color"]')
  let choice = readChoice()

  const current = () => resolveTheme(choice, media.matches)

  function apply() {
    if (choice === 'system') delete root.dataset.theme
    else root.dataset.theme = choice
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice))
    meta?.setAttribute('content', META_COLOR[current()])
    onChange(current())
  }

  for (const b of buttons) {
    b.addEventListener('click', () => {
      choice = sanitizeChoice(b.dataset.themeChoice)
      saveChoice(choice)
      apply()
    })
  }
  media.addEventListener('change', () => {
    if (choice === 'system') apply()
  })
  apply()
  return { current }
}
