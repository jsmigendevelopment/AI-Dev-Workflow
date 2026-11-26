import { PageHeading } from '@/components/page-heading.tsx'
import { PreferencesSection } from '@/modules/preferences/ui/preferences-section.tsx'

/** The preferences screen: the example module. */
export function PreferencesPage() {
  return (
    <section aria-labelledby="page-title">
      <PageHeading title="Preferences" />
      <PreferencesSection />
    </section>
  )
}
