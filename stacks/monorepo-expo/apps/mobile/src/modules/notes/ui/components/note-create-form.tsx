import { createNoteBody } from '@repo/contracts'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { errorMessage, fieldError } from '@/lib/errors'
import { useCreateNote } from '../../hooks/use-notes'

/** Checks the title with the shared contract first, then shows the server's message if it disagrees. */
export function NoteCreateForm() {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string>()
  const create = useCreateNote()

  const submit = () => {
    const parsed = createNoteBody.safeParse({ title })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setError(undefined)
    create.mutate(parsed.data, {
      onSuccess: () => setTitle(''),
      onError: (e) => setError(fieldError(e, 'title') ?? errorMessage(e)),
    })
  }

  return (
    <View className="gap-2 pb-4">
      <TextField
        label="New note"
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        returnKeyType="done"
        maxLength={200}
        error={error}
      />
      <Button label="Add note" onPress={submit} busy={create.isPending} />
    </View>
  )
}
