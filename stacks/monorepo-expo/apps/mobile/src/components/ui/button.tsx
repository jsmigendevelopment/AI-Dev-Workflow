import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native'

const VARIANTS = {
  primary: { box: 'bg-primary', text: 'text-primary-foreground' },
  ghost: { box: 'bg-transparent', text: 'text-primary' },
  danger: { box: 'bg-transparent', text: 'text-danger' },
} as const

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string
  variant?: keyof typeof VARIANTS
  busy?: boolean
}

/** At least 44 by 44 points (Apple's minimum touch target), with its state exposed to screen readers. */
export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const v = VARIANTS[variant]
  const off = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      className={`min-h-11 min-w-11 flex-row items-center justify-center rounded-lg px-4 ${v.box} ${off ? 'opacity-50' : 'active:opacity-80'} ${className ?? ''}`}
      {...props}
    >
      {busy ? <ActivityIndicator className="mr-2" /> : null}
      <Text className={`text-base font-semibold ${v.text}`}>{label}</Text>
    </Pressable>
  )
}
