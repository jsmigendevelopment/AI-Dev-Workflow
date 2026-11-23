import { Text, TextInput, View, type TextInputProps } from 'react-native'

interface TextFieldProps extends TextInputProps {
  label: string
  error?: string | undefined
}

/** A labelled input. The error is announced when it appears, and is part of the field's label. */
export function TextField({ label, error, className, ...props }: TextFieldProps) {
  return (
    <View className={`gap-1 ${className ?? ''}`}>
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        className={`min-h-11 rounded-lg border px-3 text-base text-foreground ${error ? 'border-danger' : 'border-border'}`}
        placeholderTextColorClassName="accent-muted"
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" role="alert" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
