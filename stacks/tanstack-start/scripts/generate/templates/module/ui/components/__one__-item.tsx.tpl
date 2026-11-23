import { Button } from '@/components/ui/button'
import { __plural__Copy as copy } from '@/modules/__mod__/copy'
import type { __Single__Dto } from '@/modules/__mod__/types'

/** One __word__ in the list. Presentational: the section owns the data and the delete. */
export function __Single__Item({
  item,
  pending,
  onDelete,
}: {
  item: __Single__Dto
  pending: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="flex-1 truncate">{item.title}</span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={onDelete} aria-label={`${copy.delete} ${item.title}`}>
        {copy.delete}
      </Button>
    </li>
  )
}
