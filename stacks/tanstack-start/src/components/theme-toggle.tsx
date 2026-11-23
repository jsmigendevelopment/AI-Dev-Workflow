import { Moon, Sun } from 'lucide-react'
import { THEME_TOGGLE_ATTRIBUTE, toggleThemeFromClick } from '@/lib/theme'

/** Works before hydration: the inline theme script handles the click (see src/lib/theme.ts). */
export function ThemeToggle() {
  return (
    <button
      type="button"
      {...{ [THEME_TOGGLE_ATTRIBUTE]: '' }}
      onClick={toggleThemeFromClick}
      aria-label="Switch between light and dark theme"
      className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-9 items-center justify-center rounded-md"
    >
      <Sun aria-hidden="true" className="size-4 dark:hidden" />
      <Moon aria-hidden="true" className="hidden size-4 dark:block" />
    </button>
  )
}
