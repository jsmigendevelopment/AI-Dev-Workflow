/**
 * Build-time text files: robots.txt, sitemap.xml, llms.txt and security.txt. Pure builders,
 * unit-tested, and written into the client build by the plugin in vite.config.ts. Never served
 * per request.
 */

/**
 * The crawler policy: search engines and AI search or answer crawlers are welcome (the `*`
 * group); AI training crawlers are not. Names checked 2026-11 against the vendors' docs; re-check
 * them whenever you edit this list. A Cloudflare zone setting can override this file at the edge:
 * keep AI "Training" on Allow or Disallow there, never Block (Block also stops search engines).
 */
export const AI_TRAINING_CRAWLERS = [
  '__usage_ai-training', // the shared training-preference token (IETF draft, 2026)
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'meta-externalagent',
  'Amazonbot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'omgili',
  'Timpibot',
] as const

/** Allowed through the `*` group; listed so a test proves none of them is blocked by mistake. */
export const AI_SEARCH_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
] as const

export function robotsTxt(siteUrl: string): string {
  return [
    '# Search engines and AI search crawlers: welcome.',
    'User-agent: *',
    'Allow: /',
    '',
    '# AI training crawlers: no.',
    ...AI_TRAINING_CRAWLERS.map((name) => `User-agent: ${name}`),
    'Disallow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')
}

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

export function sitemapXml(siteUrl: string, paths: readonly string[]): string {
  const urls = paths.map((p) => `  <url><loc>${xml(new URL(p, `${siteUrl}/`).toString())}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function llmsTxt(
  siteUrl: string,
  site: { name: string; description: string },
  pages: ReadonlyArray<{ path: string; title: string; summary: string }>,
): string {
  const links = pages.map((p) => `- [${p.title}](${new URL(p.path, `${siteUrl}/`).toString()}): ${p.summary}`)
  return `# ${site.name}\n\n> ${site.description}\n\n## Pages\n\n${links.join('\n')}\n`
}

/** RFC 9116. `Expires` moves with every build; a build more than ~11 months old is stale. */
export function securityTxt(siteUrl: string, contact: string, now: Date): string {
  const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    'Preferred-Languages: en',
    '',
  ].join('\n')
}
