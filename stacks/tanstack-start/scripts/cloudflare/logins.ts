// The ways a person can sign in through Cloudflare Access (`--logins`), and the setup steps for
// each. Sources (cloudflare-docs, 2026-11-22): src/content/docs/cloudflare-one/integrations/
// identity-providers/{google,github,facebook-login,linkedin,yandex,entra-id,generic-oidc,
// one-time-pin}.mdx; the identity provider `type` enum in cloudflare/api-schemas openapi.json.
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
const paste = (name: string, id: string, secret: string) =>
  `Paste them into .env.cloudflare.local (git-ignored), never into chat: ACCESS_${name}_CLIENT_ID=<the ${id}> and ACCESS_${name}_CLIENT_SECRET=<the ${secret}>.`

export const LOGINS = {
  google: {
    type: 'google',
    label: 'Google (recommended: any Google account)',
    needs: ids('GOOGLE'),
    minutes: 5,
    steps: (team) => [
      'Open https://console.cloud.google.com/projectcreate and create a project (any name).',
      'Open https://console.cloud.google.com/auth/overview, click Get started, enter an app name and your email, pick External, then Create.',
      'Open https://console.cloud.google.com/auth/clients and click Create client. Application type: Web application.',
      `Authorized JavaScript origins: https://${team}`,
      `Authorized redirect URIs: ${callback(team)}`,
      'Click Create, then copy the Client ID and the Client secret.',
      paste('GOOGLE', 'Client ID', 'Client secret'),
    ],
    config: oauth('GOOGLE'),
  },
  github: {
    type: 'github',
    label: 'GitHub (any GitHub account; can also allow a whole GitHub org)',
    needs: ids('GITHUB'),
    minutes: 3,
    steps: (team) => [
      'Open https://github.com/settings/applications/new (an OAuth app, not a GitHub App).',
      `Application name: your app's name. Homepage URL: https://${team}`,
      `Authorization callback URL: ${callback(team)}`,
      'Click Register application, copy the Client ID, then click Generate a new client secret and copy it.',
      paste('GITHUB', 'Client ID', 'client secret'),
      'After setup, open Zero Trust → Integrations → Identity providers → GitHub → Finish setup, and click Authorize (it reads orgs and emails).',
    ],
    config: oauth('GITHUB'),
  },
  facebook: {
    type: 'facebook',
    label: 'Facebook',
    needs: ids('FACEBOOK'),
    minutes: 10,
    steps: (team) => [
      'Open https://developers.facebook.com/apps/creation/ and create an app with the use case "Authenticate and request data from users with Facebook Login".',
      'Open App settings → Basic and copy the App ID and App secret.',
      `Open Use cases → Facebook Login → Settings. Use Strict Mode for redirect URIs: Yes. Valid OAuth Redirect URIs: ${callback(team)}. Save.`,
      paste('FACEBOOK', 'App ID', 'App secret'),
    ],
    config: oauth('FACEBOOK'),
  },
  linkedin: {
    type: 'linkedin',
    label: 'LinkedIn',
    needs: ids('LINKEDIN'),
    minutes: 10,
    steps: (team) => [
      'Open https://www.linkedin.com/developers/apps/new and create an app (it needs a LinkedIn Page and a logo).',
      'In the Products tab, click Request access next to "Sign In with LinkedIn using OpenID Connect".',
      `In the Auth tab, under Authorized redirect URLs for your app, add ${callback(team)}`,
      'In the Auth tab, copy the Client ID and the Primary Client Secret.',
      paste('LINKEDIN', 'Client ID', 'Client Secret'),
    ],
    config: oauth('LINKEDIN'),
  },
  yandex: {
    type: 'yandex',
    label: 'Yandex',
    needs: ids('YANDEX'),
    minutes: 5,
    steps: (team) => [
      'Open https://oauth.yandex.com/client/new and create a client for Web services.',
      'Under Yandex ID API, tick Access to email address, Access to user avatar, and Access to username, first name and surname, gender.',
      `Redirect URI: ${callback(team)}. Click Create app.`,
      'Copy the ClientID and the Client secret.',
      paste('YANDEX', 'ClientID', 'Client secret'),
    ],
    config: oauth('YANDEX'),
  },
  entra: {
    type: 'azureAD',
    label: 'Microsoft Entra ID (work accounts)',
    needs: [...ids('ENTRA'), 'ACCESS_ENTRA_TENANT_ID'],
    minutes: 15,
    steps: (team) => [
      `Open https://entra.microsoft.com, then Applications → App registrations → New registration. Redirect URI: Web, ${callback(team)}`,
      'Copy the Application (client) ID and the Directory (tenant) ID from its Overview.',
      'Open Certificates & secrets → New client secret, and copy its Value (shown once). Note its expiry date: sign-in stops when it expires.',
      'Open API permissions → Add a permission → Microsoft Graph → Delegated: email, offline_access, openid, profile, User.Read. Click Grant admin consent.',
      'Paste into .env.cloudflare.local, never into chat: ACCESS_ENTRA_CLIENT_ID, ACCESS_ENTRA_CLIENT_SECRET and ACCESS_ENTRA_TENANT_ID.',
    ],
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
