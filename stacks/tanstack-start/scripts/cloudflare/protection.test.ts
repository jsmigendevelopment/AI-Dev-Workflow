import { describe, expect, it } from 'vitest'

import { accessAppBody } from './access'
import { blankZone, freshWorld, LIVE_CONFIG, PACK_CONFIG, run, withAddons, zeroTrust } from './fakes'
import { readResources, setEnvVar } from './wrangler-config'

describe('test and preview protection', () => {
  const ACCESS = { CLOUDFLARE_ACCESS_TOKEN: 'set' }

  it('a dry run shows the three choices and the Bot Fight Mode option, and changes nothing', async () => {
    const files = { 'wrangler.jsonc': withAddons }
    const { code, output, writes, calls } = await run({ ...freshWorld(), zone: blankZone() }, files, {
      dryRun: true,
    })
    expect(code).toBe(0)
    expect(output()).toContain('a) Cloudflare Access (recommended)')
    expect(output()).toContain('b) A password page in the app')
    expect(output()).toContain('c) None')
    expect(output()).toContain('Bot Fight Mode: recommended for app.example.com')
    expect(writes).toEqual([])
    expect(calls.filter((c) => c.startsWith('write'))).toEqual([])
    const noDomain = await run(freshWorld(), { 'wrangler.jsonc': PACK_CONFIG }, { dryRun: true })
    expect(noDomain.output()).toContain('Bot Fight Mode: needs the production custom domain first')
  })

  it('writes the choice into env.test only, keeping comments and the other vars', () => {
    const next = setEnvVar(PACK_CONFIG, 'test', 'SITE_PROTECTION', 'password')
    const r = readResources(next)
    expect(r.test.vars).toEqual({ LAUNCHED: 'true', SITE_PROTECTION: 'password' })
    expect(r.production.vars).toEqual({ LAUNCHED: 'false', SITE_PROTECTION: 'none' })
    expect(next.split('\n').filter((l) => l.trim().startsWith('//'))).toEqual(
      PACK_CONFIG.split('\n').filter((l) => l.trim().startsWith('//')),
    )
    expect(readResources(setEnvVar(PACK_CONFIG, 'production', 'EXTRA', 'x')).production.vars.EXTRA).toBe('x')
    expect(readResources(LIVE_CONFIG).test.vars.LAUNCHED).toBe('true')
  })

  it('password: makes a random secret, sets it on the test Worker and in GitHub on ci = actions, never prints it', async () => {
    const world = freshWorld()
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const dry = await run(world, files, { dryRun: true, protect: 'password', ci: 'actions' })
    expect(dry.calls.filter((c) => c.includes('secret put') || c.startsWith('write'))).toEqual([])
    const first = await run(world, files, { protect: 'password', ci: 'actions' })
    expect(first.calls).toContain('wrangler secret put SITE_PASSWORD --env test <stdin>')
    expect(first.calls).toContain('gh secret set SITE_PASSWORD --env test')
    expect(first.calls).toContain('gh secret set SITE_PASSWORD --env preview')
    expect(first.calls.some((c) => c.includes('--env production') && c.includes('SITE_PASSWORD'))).toBe(false)
    expect(first.stdin.filter((v) => v === 'Zx81_random-SECRET-value-0123456')).toHaveLength(3)
    expect(first.output()).not.toContain('Zx81_random') // never printed: it is in .env.cloudflare.local
    expect(first.saved).toEqual({ TEST_SITE_PASSWORD: 'Zx81_random-SECRET-value-0123456' })
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('password')
    const again = await run(world, files, { protect: 'password', ci: 'actions' })
    expect(again.calls.some((c) => c.includes('secret put'))).toBe(false)
    expect(again.output()).not.toContain('Zx81_random')
  })

  it('access: asks for the token and the email first, and needs Zero Trust and a deployed Worker', async () => {
    const files = { 'wrangler.jsonc': PACK_CONFIG }
    expect((await run(freshWorld(), files, { protect: 'access' })).output()).toContain(
      'CLOUDFLARE_ACCESS_TOKEN',
    )
    expect((await run(freshWorld(), files, { protect: 'access' }, ACCESS)).output()).toContain(
      '--allow-emails',
    )
    const opts = { protect: 'access' as const, accessEmail: 'ann@example.com' }
    expect((await run(freshWorld(), files, opts, ACCESS)).output()).toContain('Zero Trust is not set up')
    // With the first test deploy skipped, nothing makes the Worker, so Access must refuse.
    const undeployed = await run(
      { ...freshWorld(), access: { ...zeroTrust(), workers: [] } },
      files,
      { ...opts, noFirstDeploy: true },
      ACCESS,
    )
    expect(undeployed.output()).toContain('not deployed yet')
    expect(readResources(files['wrangler.jsonc']).test.vars.SITE_PROTECTION).toBe('none')
  })

  it('access: one-time PIN, a CI service token in GitHub on ci = actions, one app on the test Worker; idempotent', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, accessEmail: 'ann@example.com', ci: 'actions' as const }
    const dry = await run(world, files, { ...opts, dryRun: true }, ACCESS)
    expect(dry.writes).toEqual([])
    expect(dry.output()).not.toContain('ann@example.com')

    const first = await run(world, files, opts, ACCESS)
    expect(first.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'POST /accounts/acc_1/access/identity_providers',
      'POST /accounts/acc_1/access/service_tokens',
      'POST /accounts/acc_1/access/apps',
    ])
    expect(first.writes[2]!.body).toEqual(
      accessAppBody({ kind: 'test', worker: { id: 'w_test', name: 'app-test' } }, ['idp_1'], 'tok_1', {
        emails: ['ann@example.com'],
        domains: [],
      }),
    )
    expect(first.writes[2]!.body).toMatchObject({
      destinations: [{ type: 'worker', worker_id: 'w_test' }],
      policies: [
        { decision: 'non_identity', include: [{ service_token: { token_id: 'tok_1' } }] },
        { decision: 'allow', include: [{ email: { email: 'ann@example.com' } }] },
      ],
    })
    for (const name of ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'])
      for (const env of ['test', 'preview'])
        expect(first.calls).toContain(`gh secret set ${name} --env ${env}`)
    expect(first.stdin).toContain('cfast_SECRET')
    expect(first.output()).not.toContain('cfast_SECRET')
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('access')
    expect(files['wrangler.jsonc']).not.toContain('ann@example.com')

    const second = await run(world, files, opts, ACCESS)
    expect(second.writes).toEqual([])
    expect(second.output()).toContain('exists  Access application')
  })

  it('none: records the choice and touches nothing on Cloudflare', async () => {
    const files: Record<string, string> = {
      'wrangler.jsonc': setEnvVar(PACK_CONFIG, 'test', 'SITE_PROTECTION', 'password'),
    }
    const { writes, output } = await run(freshWorld(), files, { protect: 'none' })
    expect(writes).toEqual([])
    expect(output()).toContain('open to anyone')
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('none')
  })

  const GOOGLE = {
    ...ACCESS,
    ACCESS_GOOGLE_CLIENT_ID: 'g-id.apps.googleusercontent.com',
    ACCESS_GOOGLE_CLIENT_SECRET: 'GOCSPX-DO_NOT_PRINT',
  }

  it('access: writes the team domain and AUD for the Worker’s JWT check', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    await run(world, files, { protect: 'access', allowEmails: ['ann@example.com'] }, ACCESS)
    expect(readResources(files['wrangler.jsonc']!).test.vars).toEqual({
      LAUNCHED: 'true',
      SITE_PROTECTION: 'access',
      ACCESS_TEAM_DOMAIN: 'https://ann.cloudflareaccess.com',
      ACCESS_AUD: '1'.repeat(64),
    })
    expect(readResources(files['wrangler.jsonc']!).production.vars.SITE_PROTECTION).toBe('none')
  })

  it('logins: Google first prints the person’s setup step with the real callback, and writes nothing', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, logins: 'google', allowDomains: ['@Example.com'] }
    const { writes, output } = await run(world, files, opts, ACCESS)
    expect(writes).toEqual([])
    expect(output()).toContain(
      'Setup step for you · a Google sign-in for Cloudflare Access · about 5 minutes',
    )
    expect(output()).toContain('https://ann.cloudflareaccess.com/cdn-cgi/access/callback')
    expect(output()).toContain('.agents/skills/secrets/providers/google-oauth.md')
    expect(output()).toContain('Missing: ACCESS_GOOGLE_CLIENT_ID, ACCESS_GOOGLE_CLIENT_SECRET')
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('none')
  })

  it('logins: Google and the one-time PIN, by email domain; the client secret goes only to the API', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, logins: 'google', allowDomains: ['@Example.com'] }
    const first = await run(world, files, opts, GOOGLE)
    const idps = first.writes.filter((w) => w.path.endsWith('/identity_providers'))
    expect(idps.map((w) => w.body)).toEqual([
      {
        name: 'Google',
        type: 'google',
        config: {
          client_id: GOOGLE.ACCESS_GOOGLE_CLIENT_ID,
          client_secret: GOOGLE.ACCESS_GOOGLE_CLIENT_SECRET,
        },
      },
      { name: 'One-time PIN by email', type: 'onetimepin', config: {} },
    ])
    expect(first.output()).not.toContain('DO_NOT_PRINT')
    expect(first.calls.join('\n')).not.toContain('DO_NOT_PRINT')
    expect(files['wrangler.jsonc']).not.toContain('DO_NOT_PRINT')
    expect(first.writes.at(-1)!.body).toMatchObject({
      allowed_idps: ['idp_1', 'idp_2'],
      auto_redirect_to_identity: false,
      policies: [
        { decision: 'non_identity' },
        { decision: 'allow', include: [{ email_domain: { domain: 'example.com' } }] },
      ],
    })
    const again = await run(world, files, opts, GOOGLE)
    expect(again.writes).toEqual([])
    expect(again.output()).toContain('exists  Google login')
  })

  it('logins: a GitHub org needs the GitHub login; adding it later updates the same app', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const github = { ACCESS_GITHUB_CLIENT_ID: 'Iv1.x', ACCESS_GITHUB_CLIENT_SECRET: 'gh-DO_NOT_PRINT' }
    const noLogin = await run(world, files, { protect: 'access', allowGithubOrg: 'acme' }, ACCESS)
    expect(noLogin.output()).toContain('--allow-github-org needs the GitHub login')
    await run(world, files, { protect: 'access', allowEmails: ['ann@example.com'] }, ACCESS)
    const later = await run(
      world,
      files,
      { protect: 'access', logins: 'github', allowGithubOrg: 'acme' },
      { ...ACCESS, ...github },
    )
    expect(later.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'POST /accounts/acc_1/access/identity_providers',
      'PUT /accounts/acc_1/access/apps/app_1',
    ])
    expect(later.writes[1]!.body).toMatchObject({
      policies: [
        { decision: 'non_identity' },
        { include: [{ 'github-organization': { name: 'acme', identity_provider_id: 'idp_2' } }] },
      ],
    })
    expect(world.access.apps).toHaveLength(1)
  })

  it('logins: refuses Discord (no Access login, no documented email claim) and unknown names', async () => {
    const files = { 'wrangler.jsonc': PACK_CONFIG }
    const world = { ...freshWorld(), access: zeroTrust() }
    const who = { protect: 'access' as const, allowEmails: ['ann@example.com'] }
    const discord = await run(world, files, { ...who, logins: 'google,discord' }, ACCESS)
    expect(discord.output()).toContain('Discord is not offered')
    expect(discord.writes).toEqual([])
    expect((await run(world, files, { ...who, logins: 'myspace' }, ACCESS)).output()).toContain(
      'Unknown login myspace',
    )
  })

  it('production: lists the choices, and a real run needs the person’s yes', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    expect((await run(world, files, {}, ACCESS)).output()).toContain('--protect-production all')
    const opts = { protectProduction: 'all', allowEmails: ['ann@example.com'] }
    const dry = await run(world, files, { ...opts, dryRun: true }, ACCESS)
    expect(dry.writes).toEqual([])
    expect(dry.output()).toContain('would create the Access application "app-production (production)"')
    const unasked = await run(world, files, opts, ACCESS)
    expect(unasked.writes).toEqual([])
    expect(unasked.output()).toContain('add --production-ok after they say yes')
  })

  it('production all: the whole Worker, a token in the production GitHub environment, ACCESS_PATHS /*', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = {
      protectProduction: 'all',
      allowDomains: ['example.com'],
      productionOk: true,
      ci: 'actions' as const,
    }
    const { writes, calls } = await run(world, files, opts, ACCESS)
    expect(writes.at(-1)!.body).toMatchObject({
      name: 'app-production (production)',
      destinations: [{ type: 'worker', worker_id: 'w_prod' }],
    })
    expect(calls).toContain('gh secret set CF_ACCESS_CLIENT_SECRET --env production')
    expect(calls).not.toContain('gh secret set CF_ACCESS_CLIENT_SECRET --env preview')
    const r = readResources(files['wrangler.jsonc']!)
    expect(r.production.vars).toMatchObject({
      SITE_PROTECTION: 'access',
      ACCESS_PATHS: '/*',
      LAUNCHED: 'false',
    })
    expect(r.production.vars.ACCESS_AUD).toMatch(/^[0-9a-f]{64}$/)
    expect(r.test.vars.SITE_PROTECTION).toBe('none')
  })

  it('production paths: each path on workers.dev and the custom domain; the rest stays open', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': withAddons }
    const opts = {
      protectProduction: '/admin/*,/ops/*',
      allowEmails: ['ann@example.com'],
      productionOk: true,
    }
    const { writes } = await run(world, files, opts, ACCESS)
    expect(writes.at(-1)!.body).toMatchObject({
      name: 'app-production (production paths)',
      destinations: [
        { type: 'public', uri: 'app-production.ann.workers.dev/admin/*' },
        { type: 'public', uri: 'app-production.ann.workers.dev/ops/*' },
        { type: 'public', uri: 'app.example.com/admin/*' },
        { type: 'public', uri: 'app.example.com/ops/*' },
      ],
    })
    expect(readResources(files['wrangler.jsonc']!).production.vars.ACCESS_PATHS).toBe('/admin/*,/ops/*')
    const bad = await run(world, files, { ...opts, protectProduction: 'admin' }, ACCESS)
    expect(bad.output()).toContain('--protect-production takes all, or paths')
  })
})
