import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** A UUID that is not one of your notes (deleted, someone else's, never made). Answered with 404. */
export function NoteNotFound() {
  return (
    <section className="flex flex-col gap-6">
      <meta name="robots" content="noindex" />
      <h1 className="text-3xl font-semibold tracking-tight">Note not found</h1>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <FileQuestion aria-hidden className="text-muted-foreground size-8" />
        <p className="font-medium">There is no note at this address.</p>
        <p className="text-muted-foreground text-sm">It may have been deleted, or the link is incomplete.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/notes">Back to your notes</Link>
        </Button>
      </div>
    </section>
  )
}
