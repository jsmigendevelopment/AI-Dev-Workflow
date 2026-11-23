/**
 * The site's identity, in one file. Plain constants: `vite.config.ts` imports this too, to write
 * the sitemap, robots.txt and llms.txt. The URL lives in site-url.ts (it comes from the build).
 */
export const SITE = {
  name: 'App',
  description: 'A TanStack Start app on Cloudflare Workers: fast, accessible and secure by default.',
  locale: 'en_US',
  /** 1200 x 630 PNG in public/. Regenerate it and the icons with `pnpm icons`. */
  shareImage: { path: '/og.png', width: 1200, height: 630, alt: 'App' },
  themeColor: { light: '#ffffff', dark: '#0a0a0a' },
} as const

/** Public pages for the sitemap and llms.txt. App pages behind sign-in stay out (and are noindex). */
export const INDEXABLE_PAGES: ReadonlyArray<{ path: string; title: string; summary: string }> = [
  { path: '/', title: 'Home', summary: 'What the app is and how to start.' },
]

/** Used when SITE_URL is not set: local dev, tests and CI. */
export const DEFAULT_SITE_URL = 'http://localhost:3000'
