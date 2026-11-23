import { useRef } from 'react'
import { AuthControls } from '@/components/auth-controls'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDeleteFile, useFilesList, useUploadFile } from '../../hooks/use-files'
import { ALLOWED_TYPES } from '../../schemas'

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`

export function FilesView() {
  const list = useFilesList()
  const upload = useUploadFile()
  const remove = useDeleteFile()
  const input = useRef<HTMLInputElement>(null)

  if (list.isPending) return <p className="text-muted-foreground">Loading files…</p>
  if (list.isError) {
    if (list.error.code === 'unauthenticated')
      return (
        <EmptyState title="Sign in to see your files">
          <div className="mt-3 flex justify-center">
            <AuthControls />
          </div>
        </EmptyState>
      )
    return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
  }

  const files = list.data.pages.flatMap((page) => page.items)
  const error = upload.error ?? remove.error
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your files</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const file = input.current?.files?.[0]
            if (file) upload.mutate(file, { onSuccess: () => event.currentTarget?.reset() })
          }}
        >
          <Input
            ref={input}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            aria-label="Choose a file"
            required
          />
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error.fields?._?.[0] ?? Object.values(error.fields ?? {})[0]?.[0] ?? error.message}
          </p>
        ) : null}
        {files.length === 0 ? (
          <EmptyState title="No files yet">Upload your first one above.</EmptyState>
        ) : (
          <ul className="divide-y">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-2 py-2">
                <a className="truncate underline" href={`/api/files/${file.id}`}>
                  {file.name}
                </a>
                <span className="text-muted-foreground text-sm">{kb(file.size)}</span>
                <Button variant="outline" size="sm" onClick={() => remove.mutate({ id: file.id })}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage ? (
          <Button
            variant="outline"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            Load more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
