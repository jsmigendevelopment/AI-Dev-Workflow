import { AppError } from '@/lib/app-error'
import type { BillingService } from './billing.service'

/** Stripe events are a few KB; anything far bigger is not from Stripe. */
export const MAX_WEBHOOK_BYTES = 256 * 1024

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Reads at most `max` bytes of the body, without trusting Content-Length. Null if it's bigger. */
async function readBounded(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * The webhook's HTTP controller: cheap checks before reading the body, the raw body (never
 * re-serialised JSON) to the service, and a status Stripe understands. 2xx stops retries;
 * 5xx makes Stripe retry, so storage errors return 500.
 */
export const billingWebhook =
  (service: BillingService) =>
  async (request: Request): Promise<Response> => {
    const signature = request.headers.get('stripe-signature')
    if (!signature || signature.length > 2048) return json(400, { error: 'Missing signature.' })
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_WEBHOOK_BYTES) return json(413, { error: 'Too large.' })
    const body = await readBounded(request, MAX_WEBHOOK_BYTES)
    if (body === null) return json(413, { error: 'Too large.' })
    try {
      const outcome = await service.webhook(body, signature)
      return json(200, { received: true, outcome })
    } catch (error) {
      if (error instanceof AppError && error.code === 'unauthenticated')
        return json(400, { error: 'Invalid signature.' })
      if (error instanceof AppError && error.code === 'unavailable')
        return json(503, { error: 'Billing is not set up.' })
      console.error('unhandled', error)
      return json(500, { error: 'Try again.' })
    }
  }
