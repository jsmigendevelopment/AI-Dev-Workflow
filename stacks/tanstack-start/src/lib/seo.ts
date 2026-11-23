import { SITE } from './site'
import { absoluteUrl } from './site-url'

export interface PageHeadInput {
  /** The path of this page, used for its canonical URL. */
  path: string
  /** Unique per page. The site name is appended. */
  title: string
  /** Unique per page, one or two sentences. */
  description: string
  /** App pages, dev pages and error pages: kept out of search and the sitemap. */
  noindex?: boolean
}

type Meta = { title: string } | { name: string; content: string } | { property: string; content: string }

/**
 * Every route's metadata comes from here: title, description, canonical, Open Graph and Twitter.
 * Pure, so it is unit-tested; the result goes straight into a route's `head()`.
 */
export function pageHead({ path, title, description, noindex }: PageHeadInput) {
  const fullTitle = path === '/' ? SITE.name : `${title} · ${SITE.name}`
  const url = absoluteUrl(path)
  const image = absoluteUrl(SITE.shareImage.path)
  const meta: Meta[] = [
    { title: fullTitle },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE.name },
    { property: 'og:locale', content: SITE.locale },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: String(SITE.shareImage.width) },
    { property: 'og:image:height', content: String(SITE.shareImage.height) },
    { property: 'og:image:alt', content: SITE.shareImage.alt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ]
  if (noindex) meta.push({ name: 'robots', content: 'noindex' })
  return { meta, links: noindex ? [] : [{ rel: 'canonical', href: url }] }
}

/** Site-wide JSON-LD for the home page. Types whose required fields we can fill: no LocalBusiness. */
export function siteJsonLd() {
  const url = absoluteUrl('/')
  return {
    type: 'application/ld+json',
    children: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${url}#website`,
          name: SITE.name,
          url,
          publisher: { '@id': `${url}#org` },
        },
        {
          '@type': 'Organization',
          '@id': `${url}#org`,
          name: SITE.name,
          url,
          logo: absoluteUrl('/icon-512.png'),
        },
      ],
    }).replace(/</g, '\\u003c'), // a `</script>` in any value can't end the tag
  }
}
