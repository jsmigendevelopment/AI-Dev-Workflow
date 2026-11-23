import { createContext, useContext } from 'react'

/** Whether Clerk keys are set on the server. False in a fresh clone, in CI and in tests. */
export const AuthEnabledContext = createContext(false)

export const useAuthEnabled = () => useContext(AuthEnabledContext)
