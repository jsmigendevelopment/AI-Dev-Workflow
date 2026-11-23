/**
 * The no-flash theme. A tiny inline script, first in <head>, sets `data-theme` and
 * `color-scheme` on <html> before the first paint: the stored choice, else the system setting
 * (followed live). It also handles the toggle itself with a capture listener on `window`, so a tap
 * during hydration is not lost. The React handler does nothing once the script is installed.
 *
 * CSS keys off `[data-theme=dark]` (the `dark:` variant in styles.css). The script carries the
 * response's CSP nonce, so no `'unsafe-inline'` is needed.
 */
export const THEME_STORAGE_KEY = 'theme'
export const THEME_TOGGLE_ATTRIBUTE = 'data-theme-toggle'

export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');function s(){try{var v=localStorage.getItem('${THEME_STORAGE_KEY}');if(v==='light'||v==='dark')return v}catch(e){}}function a(t){t=t||s()||(m.matches?'dark':'light');d.setAttribute('data-theme',t);d.style.colorScheme=t}a();m.addEventListener('change',function(){if(!s())a()});addEventListener('prerenderingchange',function(){a()});window.__themeToggle=1;addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('[${THEME_TOGGLE_ATTRIBUTE}]');if(!b)return;var t=d.getAttribute('data-theme')==='dark'?'light':'dark';a(t);try{localStorage.setItem('${THEME_STORAGE_KEY}',t)}catch(e){}},true)})()`

/** React click handler for the toggle: a no-op when the inline script is installed. */
export function toggleThemeFromClick() {
  if ((window as Window & { __themeToggle?: 1 }).__themeToggle) return
  const root = document.documentElement
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
  root.style.colorScheme = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage unavailable: the choice lasts for this page view only.
  }
}
