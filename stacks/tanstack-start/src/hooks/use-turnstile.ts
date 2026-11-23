import { type RefObject, useCallback, useRef } from 'react'

import { usePublicConfig } from './use-public-config'

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string
  execute(widgetId: string): void
  reset(widgetId: string): void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<TurnstileApi> | undefined

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      scriptPromise = undefined
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Turnstile for one form, lazy and off by default. Nothing loads until `prepare()` (call it on the
 * form's first focus), and with no site key configured nothing ever loads and `token()` is
 * undefined. Pass a ref to an empty `<div>` inside the form; the widget renders there.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const { turnstileSiteKey } = usePublicConfig()
  const widget = useRef<{ api: TurnstileApi; id: string }>(null)
  const pending = useRef<{ resolve: (t: string | undefined) => void }>(null)

  const prepare = useCallback(async () => {
    if (!turnstileSiteKey || widget.current || !containerRef.current) return
    const api = await loadScript()
    if (widget.current || !containerRef.current) return
    const settle = (token: string | undefined) => {
      pending.current?.resolve(token)
      pending.current = null
    }
    const id = api.render(containerRef.current, {
      sitekey: turnstileSiteKey,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token: string) => settle(token),
      'error-callback': () => settle(undefined),
      'expired-callback': () => settle(undefined),
    })
    widget.current = { api, id }
  }, [turnstileSiteKey, containerRef])

  /** A fresh single-use token, or undefined when Turnstile is off or could not run. */
  const token = useCallback(async (): Promise<string | undefined> => {
    if (!turnstileSiteKey) return undefined
    try {
      await prepare()
    } catch {
      return undefined
    }
    const current = widget.current
    if (!current) return undefined
    const result = new Promise<string | undefined>((resolve) => (pending.current = { resolve }))
    current.api.reset(current.id)
    current.api.execute(current.id)
    return result
  }, [prepare, turnstileSiteKey])

  return { enabled: Boolean(turnstileSiteKey), prepare, token }
}
