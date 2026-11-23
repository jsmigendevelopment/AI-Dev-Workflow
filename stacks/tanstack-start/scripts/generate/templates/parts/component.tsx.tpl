import type { ReactNode } from 'react'

/** __Title__. Presentational: takes props and renders; never fetches data or reads the router. */
export function __Name__({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-muted-foreground text-sm">{children}</div> : null}
    </div>
  )
}
