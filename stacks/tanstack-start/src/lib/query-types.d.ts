import type { AppError } from './app-error'

// Every query and mutation error in the app is an AppError (`call()` guarantees it).
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AppError
  }
}
