import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  message: string
  /** The next step, such as a button. Optional: some screens have none yet. */
  action?: ReactNode
  /** Extra lines under the message, such as an error's reference ID. */
  children?: ReactNode
}

/** A designed state card: icon, title, specific message and the next action (design.md "Empty state"). */
export function EmptyState({ icon: Icon, title, message, action, children }: EmptyStateProps) {
  return (
    <div className="grid min-h-[19rem] content-center justify-items-center gap-3 rounded-r3 border border-line bg-surface p-8 text-center shadow-hair">
      <Icon className="box-content size-5 rounded-r2 bg-inset p-3 text-action" aria-hidden="true" />
      <h2 className="text-[1.375rem] font-semibold tracking-tight">{title}</h2>
      <p>{message}</p>
      {children}
      {action}
    </div>
  )
}
