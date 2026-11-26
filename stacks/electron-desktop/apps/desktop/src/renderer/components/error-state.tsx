import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { EmptyState } from './empty-state.tsx'

export interface ErrorStateProps {
  title: string
  message: string
  /** The next action, such as a "Try again" button. Required: an error always offers a way on. */
  action: ReactNode
  /** The reference the person can quote, such as REF-017. */
  referenceId: string
}

/** A designed error: icon, title, specific message, next action and reference ID (AGENTS.md "Code"). */
export function ErrorState({ title, message, action, referenceId }: ErrorStateProps) {
  return (
    <div role="alert">
      <EmptyState icon={TriangleAlert} title={title} message={message} action={action}>
        <p className="font-mono text-xs text-muted">Reference {referenceId}</p>
      </EmptyState>
    </div>
  )
}
