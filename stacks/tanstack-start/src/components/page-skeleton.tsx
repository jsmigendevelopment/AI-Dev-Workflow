import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * What a page shows while its loader runs longer than `defaultPendingMs`: the shape every page
 * here has (a heading, then a card of rows), so nothing jumps when the real page arrives.
 */
export function PageSkeleton() {
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
