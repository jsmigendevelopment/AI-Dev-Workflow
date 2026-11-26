import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn.ts'

/** The app's text field (shadcn/ui's shape, the design tokens): 40 px tall, a thicker edge when invalid. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-h-10 rounded-r1 border border-field-line bg-surface px-3 text-fg tabular-nums aria-invalid:border-2 aria-invalid:border-fg',
        className,
      )}
      {...props}
    />
  )
}
