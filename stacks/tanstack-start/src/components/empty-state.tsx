import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-muted-foreground mt-2 text-sm">{children}</div> : null}
    </div>
  )
}
