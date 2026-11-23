import * as z from 'zod'

// Checkout and the portal take no input: the price comes from config and the customer from
// the signed-in user. Strict, so a priceId or customerId in the body is a validation error.
export const startCheckoutInput = z.strictObject({})
export const openPortalInput = z.strictObject({})
export const getBillingInput = z.strictObject({})
