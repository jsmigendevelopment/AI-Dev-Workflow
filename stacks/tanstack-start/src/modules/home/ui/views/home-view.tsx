import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

export function HomeView() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Your app starts here</h1>
      <p className="text-muted-foreground">
        A TanStack Start starter on Cloudflare Workers with D1, Clerk and shadcn/ui. The notes module shows
        every layer.
      </p>
      <div>
        <Button asChild>
          <Link to="/notes">Open notes</Link>
        </Button>
      </div>
    </section>
  )
}
