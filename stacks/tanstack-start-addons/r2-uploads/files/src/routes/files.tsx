import { createFileRoute } from '@tanstack/react-router'
import { filesQueries } from '@/modules/files/hooks/use-files'
import { FilesView } from '@/modules/files/ui/views/files-view'

export const Route = createFileRoute('/files')({
  head: () => ({ meta: [{ title: 'Files' }] }),
  loader: ({ context }) => context.queryClient.infiniteQuery(filesQueries.list()).catch(() => undefined),
  component: FilesView,
})
