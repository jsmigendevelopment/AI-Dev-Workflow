/** The page's static layout. It fetches nothing, so it renders at once; sections load on their own. */
export function __View__() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">__title__</h1>
    </section>
  )
}
