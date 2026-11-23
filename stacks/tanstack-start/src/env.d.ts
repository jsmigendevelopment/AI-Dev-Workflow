// Secrets and vars that `wrangler types` can't see (they are not in wrangler.jsonc).
// Set them in .dev.vars locally and with `wrangler secret put` in production.
// Every name here is validated in src/lib/env-schema.ts.
declare namespace Cloudflare {
  interface Env {
    CLERK_PUBLISHABLE_KEY?: string
    CLERK_SECRET_KEY?: string
    CLERK_JWT_KEY?: string
    // Optional extra origins for Clerk's authorizedParties (src/lib/authorized-parties.ts).
    CLERK_AUTHORIZED_PARTIES?: string
    TURNSTILE_SITE_KEY?: string
    TURNSTILE_SECRET_KEY?: string
    // The password gate (test and previews only), set by setup-cloudflare --protect password.
    SITE_PASSWORD?: string
    // Cloudflare Access (SITE_PROTECTION "access"): vars that setup-cloudflare writes per environment.
    ACCESS_TEAM_DOMAIN?: string
    ACCESS_AUD?: string
    ACCESS_PATHS?: string
  }
}

// Public build-time values, validated and inlined by vite.config.ts.
interface ImportMetaEnv {
  readonly SITE_URL: string
  /** `CLOUDFLARE_ENV` at build time: '' (local), 'test' or 'production'. */
  readonly CLOUDFLARE_ENV: string
  /** The test Worker's name from wrangler.jsonc, in a test build only. */
  readonly TEST_WORKER: string
}
