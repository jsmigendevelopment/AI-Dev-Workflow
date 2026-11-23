import { __plural__Copy } from '@/modules/__mod__/copy'
import { __Plural__Section } from '@/modules/__mod__/ui/sections/__mod__-section'

/** The page's static layout. It fetches nothing, so it renders at once; each section loads alone. */
export function __Plural__View() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{__plural__Copy.title}</h1>
      <__Plural__Section />
    </section>
  )
}
