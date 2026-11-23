// Secrets and vars that `wrangler types` can't see (they are not in wrangler.jsonc).
// Set them in .dev.vars locally and with `wrangler secret put` in production.
// Every name here is validated in src/lib/env-schema.ts.
declare namespace Cloudflare {
  interface Env {
    // Clerk's name for TanStack Start (`clerk env pull` writes it). Read at runtime, not inlined.
    VITE_CLERK_PUBLISHABLE_KEY?: string
    // The pack's old name: still read, with a warning (envAliases in src/lib/env-schema.ts).
    CLERK_PUBLISHABLE_KEY?: string
    CLERK_SECRET_KEY?: string
    CLERK_JWT_KEY?: string
    // Optional extra origins for Clerk's authorizedParties (src/lib/authorized-parties.ts).
    CLERK_AUTHORIZED_PARTIES?: string
    // "true": native apps' bearer tokens without azp on /api/v1 (src/lib/authorized-parties.ts).
    CLERK_ALLOW_NATIVE_TOKENS?: string
    // The value a native token's `app` claim must have (Clerk's session token claims).
    CLERK_NATIVE_APP_CLAIM?: string
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
