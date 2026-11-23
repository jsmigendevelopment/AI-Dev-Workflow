// Regenerates the icon set and the default share image from public/favicon.svg and SITE in
// src/lib/site.ts. Run after changing either: `pnpm icons`. Output is committed to public/.
// Uses Playwright's Chromium (set PLAYWRIGHT_CHROMIUM_PATH to use a browser you already have).
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const SITE_FILE = readFileSync('src/lib/site.ts', 'utf8')
const pick = (key: string) => new RegExp(`${key}: '([^']+)'`).exec(SITE_FILE)?.[1] ?? ''
const name = pick('name')
const description = pick('description')
const svg = readFileSync('public/favicon.svg', 'utf8')
  // Icons are opaque PNGs: render the light-scheme colors.
  .replace(/@media[^{]+\{[^}]*\}[^}]*\}/, '')

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
const page = await browser.newPage()

async function shot(html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewportSize({ width, height })
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`)
  return page.screenshot({ type: 'png', omitBackground: false })
}

const icon = (size: number, pad = 0) =>
  shot(
    `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#fff">` +
      `<div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`,
    size,
    size,
  )

writeFileSync('public/apple-touch-icon.png', await icon(180, 18))
writeFileSync('public/icon-192.png', await icon(192))
writeFileSync('public/icon-512.png', await icon(512))

// favicon.ico: 16, 32 and 48 px PNGs in one ICO container.
const sizes = [16, 32, 48]
const pngs = await Promise.all(sizes.map((s) => icon(s)))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i
  header.writeUInt8(size, entry)
  header.writeUInt8(size, entry + 1)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(pngs[i]!.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += pngs[i]!.length
})
writeFileSync('public/favicon.ico', Buffer.concat([header, ...pngs]))

writeFileSync(
  'public/og.png',
  await shot(
    `<div style="box-sizing:border-box;width:1200px;height:630px;padding:96px;display:flex;flex-direction:column;justify-content:space-between;background:#fafafa;color:#171717;font-family:system-ui,sans-serif">` +
      `<div style="width:120px;height:120px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>` +
      `<div><div style="font-size:88px;font-weight:700;letter-spacing:-0.02em">${escape(name)}</div>` +
      `<div style="margin-top:24px;font-size:36px;line-height:1.3;color:#525252;max-width:960px">${escape(description)}</div></div></div>`,
    1200,
    630,
  ),
)

writeFileSync(
  'public/site.webmanifest',
  `${JSON.stringify(
    {
      name,
      short_name: name,
      description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  )}\n`,
)

await browser.close()
console.log(
  'Wrote public/{favicon.ico,apple-touch-icon.png,icon-192.png,icon-512.png,og.png,site.webmanifest}',
)
