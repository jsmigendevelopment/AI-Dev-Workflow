import { createFileRoute } from '@tanstack/react-router'
import { billingQueries } from '@/modules/billing/hooks/use-billing'
import { BillingView } from '@/modules/billing/ui/views/billing-view'

// Thin: start loading the status, render the module's view. The server function checks auth.
export const Route = createFileRoute('/billing')({
  head: () => ({ meta: [{ title: 'Billing' }] }),
  loader: ({ context }) => context.queryClient.query(billingQueries.status()).catch(() => undefined),
  component: BillingView,
})
