import { PageHeading } from '@/components/page-heading.tsx'

/** The first screen. Replace it with the app's own; it is here so the shell has somewhere to land. */
export function HomePage() {
  return (
    <section aria-labelledby="page-title">
      <PageHeading title="Home" />
      <p className="max-w-prose text-muted">
        This app was made from the onRails Electron starter. The Preferences screen is the example module: a
        form that reads and writes through the engine and its SQLite data file.
      </p>
    </section>
  )
}
