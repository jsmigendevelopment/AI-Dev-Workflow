import type { NoteDto } from '@repo/contracts'
import { Text, View } from 'react-native'
import { Button } from '@/components/ui/button'

export function NoteRow({
  note,
  deleting,
  onDelete,
}: {
  note: NoteDto
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border py-2">
      <Text className="flex-1 text-base text-foreground">{note.title}</Text>
      <Button
        label="Delete"
        accessibilityLabel={`Delete ${note.title}`}
        variant="danger"
        busy={deleting}
        onPress={onDelete}
      />
    </View>
  )
}
