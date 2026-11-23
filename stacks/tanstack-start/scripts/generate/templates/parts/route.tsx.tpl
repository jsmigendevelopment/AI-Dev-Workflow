import { createFileRoute } from '@tanstack/react-router'

import { pageHead } from '@/lib/seo'
__LOADER_IMPORT__import { __View__ } from '@/modules/__mod__/ui/views/__view__'

// Thin: start the data loading, render the module's view. The server functions check auth.
// An app page behind sign-in: noindex, and not in the sitemap.
export const Route = createFileRoute('__path__')({
  head: () => pageHead({ path: '__path__', title: '__title__', description: '__description__', noindex: true }),
__LOADER__  component: __View__,
})
