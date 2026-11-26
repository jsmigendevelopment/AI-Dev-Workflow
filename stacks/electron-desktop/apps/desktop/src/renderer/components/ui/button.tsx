import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn.ts'

const VARIANTS = {
  primary: 'bg-action text-on-action hover:opacity-90',
  outline: 'border border-field-line bg-surface text-fg hover:bg-inset',
} as const

/** The app's button (shadcn/ui's shape, the design tokens): 40 px tall, primary or outline. */
export function Button({
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-r1 px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
