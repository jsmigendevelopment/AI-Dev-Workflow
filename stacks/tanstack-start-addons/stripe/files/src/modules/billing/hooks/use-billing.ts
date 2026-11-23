import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { call } from '@/lib/api-call'
import { getBilling, openPortal, startCheckout } from '../server/billing.functions'

export const billingKeys = { all: ['billing'] as const }

export const billingQueries = {
  status: () =>
    queryOptions({
      queryKey: [...billingKeys.all, 'status'] as const,
      queryFn: ({ signal }) => call(() => getBilling({ data: {}, signal })),
    }),
}

export const useBilling = () => useQuery(billingQueries.status())

/** Both send the browser to a Stripe-hosted page. Card details never touch this app. */
const goTo = ({ url }: { url: string }) => window.location.assign(url)

export const useStartCheckout = () =>
  useMutation({ mutationFn: () => call(() => startCheckout({ data: {} })), onSuccess: goTo })
export const useOpenPortal = () =>
  useMutation({ mutationFn: () => call(() => openPortal({ data: {} })), onSuccess: goTo })
