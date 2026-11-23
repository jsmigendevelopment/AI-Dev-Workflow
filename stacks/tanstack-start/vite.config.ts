import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildEnvSchema, parseEnv } from './src/lib/env-schema.ts'
import { llmsTxt, robotsTxt, securityTxt, sitemapXml } from './src/lib/seo-files.ts'
import { DEFAULT_SITE_URL, INDEXABLE_PAGES, SITE } from './src/lib/site.ts'

/**
 * robots.txt, sitemap.xml, llms.txt and security.txt, all served in dev. The build writes only
 * security.txt: the Worker answers the other three (src/lib/seo-routes.ts), so a not-launched
 * environment can refuse crawlers (src/lib/launch.ts).
 */
function seoFiles(siteUrl: string, securityContact: string): Plugin {
  const files = () => ({
    'robots.txt': robotsTxt(siteUrl),
    'sitemap.xml': sitemapXml(
      siteUrl,
      INDEXABLE_PAGES.map((p) => p.path),
    ),
    'llms.txt': llmsTxt(siteUrl, SITE, INDEXABLE_PAGES),
    '.well-known/security.txt': securityTxt(siteUrl, securityContact, new Date()),
  })
  return {
    name: 'seo-files',
    generateBundle() {
      if (this.environment.name !== 'client') return
      const fileName = '.well-known/security.txt'
      this.emitFile({ type: 'asset', fileName, source: files()[fileName] })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const body = files()[(req.url ?? '').slice(1).split('?')[0] as keyof ReturnType<typeof files>]
        if (body === undefined) return next()
        res.setHeader(
          'Content-Type',
          req.url?.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8',
        )
        res.end(body)
      })
    },
  }
}

// Order matters: cloudflare first (runs SSR inside workerd), then Start, then React.
export default defineConfig(({ mode }) => {
  // Fails dev and build fast on a malformed value, naming the variable, never printing it.
  const env = parseEnv(buildEnvSchema, loadEnv(mode, process.cwd(), ''), 'build')
  const siteUrl = env.SITE_URL ?? DEFAULT_SITE_URL
  if (!env.SITE_URL && mode === 'production')
    console.warn(`SITE_URL is not set: canonicals use ${DEFAULT_SITE_URL} and production is sent noindex.`)
  const securityContact = env.SECURITY_CONTACT ?? `mailto:security@${new URL(siteUrl).hostname}`
  return {
    resolve: { tsconfigPaths: true },
    server: { port: 3000 },
    define: { 'import.meta.env.SITE_URL': JSON.stringify(env.SITE_URL ?? '') },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tailwindcss(),
      tanstackStart(),
      react(),
      seoFiles(siteUrl, securityContact),
    ],
  }
})
