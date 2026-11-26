/** A screen's title. One h1 per screen. */
export function PageHeading({ title }: { title: string }) {
  return (
    <h1
      id="page-title"
      className="mb-6 text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.08] font-bold tracking-tight"
    >
      {title}
    </h1>
  )
}
