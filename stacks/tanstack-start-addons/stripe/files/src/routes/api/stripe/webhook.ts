import { createFileRoute } from '@tanstack/react-router'
import { billingWebhook } from '@/server/composition'

// Stripe calls this; there is no user session. The signature over the raw body is the auth.
// A server route, not a server function: it needs the raw body and real HTTP status codes.
export const Route = createFileRoute('/api/stripe/webhook')({
  server: { handlers: { POST: ({ request }) => billingWebhook()(request) } },
})
