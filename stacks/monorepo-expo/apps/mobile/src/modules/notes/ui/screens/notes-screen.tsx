import { ActivityIndicator, FlatList, Text } from 'react-native'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Screen } from '@/components/ui/screen'
import { errorMessage } from '@/lib/errors'
import { useDeleteNote, useNotes } from '../../hooks/use-notes'
import { NoteCreateForm } from '../components/note-create-form'
import { NoteRow } from '../components/note-row'

/** The signed-in user's notes from /api/v1/notes: loading, error, empty and paged list states. */
export function NotesScreen() {
  const notes = useNotes()
  const remove = useDeleteNote()
  const items = notes.data?.pages.flatMap((page) => page.items) ?? []

  const loadMore = () => {
    if (notes.hasNextPage && !notes.isFetchingNextPage) void notes.fetchNextPage()
  }

  return (
    <Screen>
      <NoteCreateForm />
      {remove.isError ? (
        <Text role="alert" className="pb-2 text-danger">
          {errorMessage(remove.error)}
        </Text>
      ) : null}
      {notes.isPending ? (
        <LoadingState label="Loading notes" />
      ) : notes.isError ? (
        <ErrorState message={errorMessage(notes.error)} onRetry={() => void notes.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(note) => note.id}
          renderItem={({ item }) => (
            <NoteRow
              note={item}
              deleting={remove.isPending && remove.variables === item.id}
              onDelete={() => remove.mutate(item.id)}
            />
          )}
          ListEmptyComponent={<EmptyState title="No notes yet" body="Add your first note above." />}
          ListFooterComponent={notes.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : undefined}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
      )}
    </Screen>
  )
}
