import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { __plural__Copy as copy } from '@/modules/__mod__/copy'
import { useCreate__Single__, useDelete__Single__, use__Plural__List } from '@/modules/__mod__/hooks/use-__mod__'
import { __Single__CreateForm } from '@/modules/__mod__/ui/components/__one__-create-form'
import { __Single__Item } from '@/modules/__mod__/ui/components/__one__-item'

/**
 * Suspense (with the skeleton) around an error boundary (with ErrorState) around the content that
 * runs the queries. It loads and fails on its own, so the rest of the page stays usable.
 */
export function __Plural__Section() {
  const { reset } = useQueryErrorResetBoundary()
  return (
    <Suspense fallback={<__Plural__Skeleton />}>
      <CatchBoundary
        getResetKey={() => '__mod__'}
        errorComponent={({ error, reset: retry }) => (
          <ErrorState
            error={error}
            onRetry={() => {
              reset()
              retry()
            }}
          />
        )}
      >
        <__Plural__Content />
      </CatchBoundary>
    </Suspense>
  )
}

function __Plural__Content() {
  const { data } = use__Plural__List()
  const create = useCreate__Single__()
  const remove = useDelete__Single__()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.sectionTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <__Single__CreateForm
          pending={create.isPending}
          error={create.error?.fields?.title?.[0] ?? create.error?.message}
          onCreate={(title, done) => create.mutate({ title }, { onSuccess: done })}
        />
        {data.length === 0 ? (
          <EmptyState title={copy.emptyTitle}>{copy.emptyBody}</EmptyState>
        ) : (
          <ul className="divide-y">
            {data.map((item) => (
              <__Single__Item
                key={item.id}
                item={item}
                pending={remove.isPending}
                onDelete={() => remove.mutate({ id: item.id })}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** The loaded layout's shape: the same card, form row and list rows, so nothing moves on load. */
export function __Plural__Skeleton() {
  return (
    <Card aria-busy="true">
      <span className="sr-only">{copy.loading}</span>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
