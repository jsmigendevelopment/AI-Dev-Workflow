import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { router } from '@/router.tsx'

// The engine runs on this PC: an error it answers won't heal on a retry, and the person should see the
// designed error state with its reference ID at once, not after three silent tries.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
