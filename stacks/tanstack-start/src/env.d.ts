// Secrets and vars that `wrangler types` can't see (they are not in wrangler.jsonc).
// Set them in .dev.vars locally and with `wrangler secret put` in production.
declare namespace Cloudflare {
  interface Env {
    CLERK_PUBLISHABLE_KEY?: string
    CLERK_SECRET_KEY?: string
  }
}
