// Secrets and vars that `wrangler types` can't see (they are not in wrangler.jsonc).
// Set them in .dev.vars locally and with `wrangler secret put` in production.
// Every name here is validated in src/lib/env-schema.ts.
declare namespace Cloudflare {
  interface Env {
    CLERK_PUBLISHABLE_KEY?: string
    CLERK_SECRET_KEY?: string
    CLERK_JWT_KEY?: string
    TURNSTILE_SITE_KEY?: string
    TURNSTILE_SECRET_KEY?: string
    // The password gate (test and previews only), set by setup-cloudflare --protect password.
    SITE_PASSWORD?: string
  }
}

// Public build-time values, validated and inlined by vite.config.ts.
interface ImportMetaEnv {
  readonly SITE_URL: string
}
