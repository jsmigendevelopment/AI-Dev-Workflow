import { cn } from '@/lib/cn.ts'

/** A loading bone shaped like the text it stands in for. Pair it with a role="status" line that says what loads. */
export function Skeleton({ className }: { className?: string }) {
  return <i className={cn('block h-3 rounded-full bg-line', className)} aria-hidden="true" />
}
