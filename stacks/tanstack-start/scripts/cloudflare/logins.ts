// The ways a person can sign in through Cloudflare Access (`--logins`), and the setup step for
// each. The click-by-click steps live in one place, the secrets skill's provider files
// (.agents/skills/secrets/providers/<file>.md, each dated and checked against the provider's docs);
// this prints only what those files can't know: the team domain and the exact URLs to paste.
// Sources (cloudflare-docs, 2026-11-22): src/content/docs/cloudflare-one/integrations/
// identity-providers/{generic-oidc,one-time-pin}.mdx; the identity provider `type` enum in
// cloudflare/api-schemas openapi.json.
//
// Each provider's OAuth client is the person's own. Its id and secret come only from
// .env.cloudflare.local (git-ignored) or the shell, never from a CLI argument, never printed.

export interface Login {
  /** The Access identity provider `type`. */
  type: string
  label: string
  /** Variables that must be set (in .env.cloudflare.local or the shell) before setup. */
  needs: string[]
  /** The "Setup step for you" body: numbered steps, given the team domain. */
  steps: (team: string) => string[]
  minutes: number
  /** The IdP's `config`, from the variables above. */
  config: (get: (name: string) => string) => Record<string, unknown>
}

const ids = (name: string) => [`ACCESS_${name}_CLIENT_ID`, `ACCESS_${name}_CLIENT_SECRET`]
const oauth = (name: string) => (get: (n: string) => string) => ({
  client_id: get(`ACCESS_${name}_CLIENT_ID`),
  client_secret: get(`ACCESS_${name}_CLIENT_SECRET`),
})
const callback = (team: string) => `https://${team}/cdn-cgi/access/callback`
const PROVIDER_DIR = '.agents/skills/secrets/providers'
/** The steps for a login with a provider file: the file, the URLs to paste, where the values go. */
const guided = (file: string, needs: string[]) => (team: string) => [
  `Open ${PROVIDER_DIR}/${file} and follow its walkthrough (the agent re-checks it against the provider's docs first).`,
  `Where it says <team>.cloudflareaccess.com, your team domain is ${team}. Origin or homepage URL: https://${team}`,
  `Callback or redirect URL: ${callback(team)}`,
  `Paste the values into .env.cloudflare.local (git-ignored), never into chat: ${needs.join(', ')}.`,
]

export const LOGINS = {
  google: {
    type: 'google',
    label: 'Google (recommended: any Google account)',
    needs: ids('GOOGLE'),
    minutes: 5,
    steps: guided('google-oauth.md', ids('GOOGLE')),
    config: oauth('GOOGLE'),
  },
  github: {
    type: 'github',
    label: 'GitHub (any GitHub account; can also allow a whole GitHub org)',
    needs: ids('GITHUB'),
    minutes: 3,
    steps: guided('github-oauth.md', ids('GITHUB')),
    config: oauth('GITHUB'),
  },
  facebook: {
    type: 'facebook',
    label: 'Facebook',
    needs: ids('FACEBOOK'),
    minutes: 10,
    steps: guided('facebook.md', ids('FACEBOOK')),
    config: oauth('FACEBOOK'),
  },
  linkedin: {
    type: 'linkedin',
    label: 'LinkedIn',
    needs: ids('LINKEDIN'),
    minutes: 10,
    steps: guided('linkedin.md', ids('LINKEDIN')),
    config: oauth('LINKEDIN'),
  },
  yandex: {
    type: 'yandex',
    label: 'Yandex',
    needs: ids('YANDEX'),
    minutes: 5,
    steps: guided('yandex.md', ids('YANDEX')),
    config: oauth('YANDEX'),
  },
  entra: {
    type: 'azureAD',
    label: 'Microsoft Entra ID (work accounts)',
    needs: [...ids('ENTRA'), 'ACCESS_ENTRA_TENANT_ID'],
    minutes: 15,
    steps: guided('entra.md', [...ids('ENTRA'), 'ACCESS_ENTRA_TENANT_ID']),
    config: (get) => ({ ...oauth('ENTRA')(get), directory_id: get('ACCESS_ENTRA_TENANT_ID') }),
  },
  oidc: {
    type: 'oidc',
    label: 'Any other OpenID Connect provider (Okta, Auth0, Keycloak and others)',
    needs: [...ids('OIDC'), 'ACCESS_OIDC_AUTH_URL', 'ACCESS_OIDC_TOKEN_URL', 'ACCESS_OIDC_CERTS_URL'],
    minutes: 15,
    steps: (team) => [
      `In your provider, create a web app (client). Redirect URI: ${callback(team)}`,
      'Copy its client ID and client secret.',
      'Open its discovery URL (…/.well-known/openid-configuration) and copy authorization_endpoint, token_endpoint and jwks_uri.',
      'Paste into .env.cloudflare.local, never into chat: ACCESS_OIDC_CLIENT_ID, ACCESS_OIDC_CLIENT_SECRET, ACCESS_OIDC_AUTH_URL, ACCESS_OIDC_TOKEN_URL, ACCESS_OIDC_CERTS_URL.',
    ],
    config: (get) => ({
      ...oauth('OIDC')(get),
      auth_url: get('ACCESS_OIDC_AUTH_URL'),
      token_url: get('ACCESS_OIDC_TOKEN_URL'),
      certs_url: get('ACCESS_OIDC_CERTS_URL'),
      pkce_enabled: true,
      scopes: ['openid', 'email', 'profile'],
    }),
  },
  otp: {
    type: 'onetimepin',
    label: 'One-time PIN by email (always on: the fallback, no setup)',
    needs: [],
    minutes: 0,
    steps: () => [],
    config: () => ({}),
  },
} satisfies Record<string, Login>

export type LoginName = keyof typeof LOGINS
export const LOGIN_NAMES = Object.keys(LOGINS) as LoginName[]

/**
 * Discord has no built-in Access provider (the type enum has none). It publishes OIDC discovery,
 * but neither Discord nor Cloudflare documents an `email` claim in its ID token, which Access
 * needs to match a policy. Unproven, so not offered.
 */
export const DISCORD_VERDICT =
  'Discord is not offered: Cloudflare Access has no Discord login, and Discord does not document an email in its OpenID Connect ID token, which Access needs. Use Google, GitHub or the one-time PIN.'

/** `--logins google,github` → the names, with the one-time PIN always added as the fallback. */
export function parseLogins(value: string | undefined): { logins: LoginName[]; problem?: string } {
  const asked = (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (asked.includes('discord')) return { logins: [], problem: DISCORD_VERDICT }
  const unknown = asked.filter((n) => !(n in LOGINS))
  if (unknown.length)
    return {
      logins: [],
      problem: `Unknown login ${unknown.join(', ')}. Pick from: ${LOGIN_NAMES.join(', ')}.`,
    }
  const logins = [...new Set([...(asked as LoginName[]), 'otp' as const])]
  return { logins }
}

/** "Google", "GitHub": the label without its note. */
export const shortLabel = (name: LoginName) => LOGINS[name].label.split(' (')[0]!

/** One provider's "Setup step for you" (the ask skill's format), with the real team domain. */
export function setupStep(name: LoginName, team: string): string[] {
  const login: Login = LOGINS[name]
  return [
    `Setup step for you · a ${shortLabel(name)} sign-in for Cloudflare Access · about ${login.minutes} minutes`,
    '',
    ...login.steps(team).map((s, i) => `${i + 1}. ${s}`),
    '',
    `When it worked: setup-cloudflare says "exists  ${shortLabel(name)} login" on its next run.`,
    'Stuck? "redirect_uri_mismatch" means the callback URL above is not exactly right: copy it again.',
  ]
}
