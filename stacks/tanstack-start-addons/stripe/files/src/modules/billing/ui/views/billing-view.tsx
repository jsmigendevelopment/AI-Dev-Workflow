import { AuthControls } from '@/components/auth-controls'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBilling, useOpenPortal, useStartCheckout } from '../../hooks/use-billing'
import type { BillingDto } from '../../types'

const STATUS: Record<BillingDto['status'], string> = {
  none: 'No subscription',
  incomplete: 'Waiting for payment',
  incomplete_expired: 'Payment expired',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Cancelled',
  unpaid: 'Unpaid',
  paused: 'Paused',
}

export function BillingView() {
  const billing = useBilling()
  const checkout = useStartCheckout()
  const portal = useOpenPortal()

  if (billing.isPending) return <p className="text-muted-foreground">Loading billing…</p>
  if (billing.isError) {
    if (billing.error.code === 'unauthenticated')
      return (
        <EmptyState title="Sign in to manage billing">
          <div className="mt-3 flex justify-center">
            <AuthControls />
          </div>
        </EmptyState>
      )
    return <ErrorState message={billing.error.message} onRetry={() => void billing.refetch()} />
  }

  const { enabled, status, currentPeriodEnd, canManage } = billing.data
  if (!enabled) return <EmptyState title="Billing isn't set up yet">Payments are switched off.</EmptyState>

  const subscribed = status !== 'none' && status !== 'canceled' && status !== 'incomplete_expired'
  const failed = checkout.error ?? portal.error
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>
          Plan: <span className="font-medium">{STATUS[status]}</span>
          {currentPeriodEnd ? (
            <span className="text-muted-foreground">
              {' '}
              · renews or ends {new Date(currentPeriodEnd).toLocaleDateString()}
            </span>
          ) : null}
        </p>
        <div className="flex gap-2">
          {subscribed ? null : (
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              Subscribe
            </Button>
          )}
          {canManage ? (
            <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
              Manage billing
            </Button>
          ) : null}
        </div>
        {failed ? (
          <p role="alert" className="text-destructive text-sm">
            {failed.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
