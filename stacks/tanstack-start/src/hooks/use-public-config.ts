import { createContext, useContext } from 'react'

export interface PublicConfig {
  /** Clerk keys are set on the server. False in a fresh clone and in tests. */
  authEnabled: boolean
  /** Turnstile's public site key, or null when Turnstile is off. */
  turnstileSiteKey: string | null
}

export const PublicConfigContext = createContext<PublicConfig>({ authEnabled: false, turnstileSiteKey: null })

export const usePublicConfig = () => useContext(PublicConfigContext)
export const useAuthEnabled = () => usePublicConfig().authEnabled
