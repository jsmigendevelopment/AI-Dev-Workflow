import { createFileRoute } from '@tanstack/react-router'

import { pageHead, siteJsonLd } from '@/lib/seo'
import { SITE } from '@/lib/site'
import { HomeView } from '@/modules/home/ui/views/home-view'

export const Route = createFileRoute('/')({
  head: () => ({
    ...pageHead({ path: '/', title: 'Home', description: SITE.description }),
    scripts: [siteJsonLd()],
  }),
  component: HomeView,
})
