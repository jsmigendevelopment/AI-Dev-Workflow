import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * A client-side navigation is silent for screen readers. After each one (not the first load),
 * move focus to the new page's heading, so its name is read and Tab starts from the content.
 */
export function RouteFocus() {
  const router = useRouter()
  useEffect(
    () =>
      router.subscribe('onResolved', ({ pathChanged }) => {
        if (!pathChanged) return
        const target = document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main')
        if (!target) return
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
        target.focus({ preventScroll: true })
      }),
    [router],
  )
  return null
}
