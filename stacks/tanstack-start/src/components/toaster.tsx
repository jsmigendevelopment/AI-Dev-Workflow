import type { ReactElement } from 'react'
import { toast, Toaster as Sonner } from 'sonner'

// The only file that imports Sonner. error-toast.tsx loads it lazily, so it ships as its own
// `toaster` chunk after the page (the lazy `toaster` budget in scripts/budgets/check-budgets.ts).

export function Toaster() {
  return <Sonner position="bottom-right" />
}

/** Shows `render(id)` as a toast; the id dismisses it. */
export function showToast(render: (dismiss: () => void) => ReactElement, durationMs: number) {
  toast.custom((id) => render(() => toast.dismiss(id)), { duration: durationMs })
}
