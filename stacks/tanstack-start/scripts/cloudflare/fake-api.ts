// The fake Cloudflare API for the setup tests: zone settings and Cloudflare Access, over the `World`.
import type { ApiResult } from './deps'
import type { World } from './fakes'

/** A write the fake API saw: every method but GET. */
export interface Write {
  method: string
  path: string
  body: unknown
}

/** `deps.api` over `world`: paths under `/accounts` are Access, the rest are the zone's. */
export function fakeApi(world: World, writes: Write[]) {
  return async (method: string, path: string, body?: unknown): Promise<ApiResult> => {
    if (method !== 'GET') writes.push({ method, path, body })
    return path.startsWith('/accounts/')
      ? accountApi(world, method, path, body)
      : zoneApi(world, method, path, body)
  }
}

function zoneApi(world: World, method: string, path: string, body: unknown): ApiResult {
  const zone = world.zone
  const z = '/zones/zone_1'
  if (method === 'GET' && path.startsWith('/zones?name='))
    return {
      status: 200,
      body: {
        result: zone && path === '/zones?name=example.com' ? [{ id: 'zone_1', name: 'example.com' }] : [],
      },
    }
  if (!zone) return { status: 404, body: null }
  if (method === 'GET' && path === `${z}/settings/always_use_https`)
    return { status: 200, body: { result: { value: zone.always_use_https } } }
  if (method === 'GET' && path === `${z}/settings/min_tls_version`)
    return { status: 200, body: { result: { value: zone.min_tls_version } } }
  if (method === 'GET' && path === `${z}/bot_management`)
    return { status: 200, body: { result: { ...zone.bots } } }
  if (method === 'GET' && path.endsWith('/entrypoint'))
    return zone.waf ? { status: 200, body: { result: zone.waf } } : { status: 404, body: { success: false } }
  const value = (body as { value?: string } | undefined)?.value
  if (path.endsWith('always_use_https')) zone.always_use_https = value!
  else if (path.endsWith('min_tls_version')) zone.min_tls_version = value!
  else if (path.endsWith('bot_management')) Object.assign(zone.bots, body)
  else if (path.endsWith('/entrypoint'))
    zone.waf = {
      id: 'rs_1',
      rules: [{ id: 'r_1', ...(body as { rules: { ref: string; expression: string }[] }).rules[0]! }],
    }
  else if (method === 'POST')
    zone.waf!.rules.push({ id: 'r_2', ...(body as { ref: string; expression: string }) })
  else if (method === 'PATCH')
    zone.waf!.rules = zone.waf!.rules.map((r) => (path.endsWith(r.id) ? { ...r, ...(body as object) } : r))
  return { status: 200, body: { success: true } }
}

function accountApi(world: World, method: string, path: string, body: unknown): ApiResult {
  const a = world.access
  const ok = (result: unknown) => ({ status: 200, body: { success: true, result } })
  if (!a) return { status: 403, body: { success: false, errors: [{ message: 'not enabled' }] } }
  const tail = path.replace('/accounts/acc_1', '')
  if (tail === '/access/organizations') return ok({ auth_domain: 'ann.cloudflareaccess.com' })
  if (tail.startsWith('/workers/workers')) return ok(a.workers)
  if (tail === '/access/identity_providers' && method === 'GET') return ok(a.idps)
  if (tail === '/access/identity_providers') {
    const id = `idp_${a.idps.length + 1}`
    a.idps.push({ id, type: (body as { type: string }).type })
    return ok({ id })
  }
  if (tail === '/workers/subdomain') return ok({ subdomain: a.subdomain })
  if (tail === '/access/service_tokens' && method === 'GET') return ok(a.tokens)
  if (tail === '/access/service_tokens') {
    a.tokens.push({ id: 'tok_1', name: (body as { name: string }).name })
    return ok({ id: 'tok_1', client_id: 'id.access', client_secret: 'cfast_SECRET' })
  }
  const token = /^\/access\/service_tokens\/(.+)$/.exec(tail)
  if (token && method === 'DELETE') {
    if (world.tokenDeleteFails) return { status: 500, body: { success: false } }
    a.tokens = a.tokens.filter((t) => t.id !== token[1])
    return ok({ id: token[1] })
  }
  if (tail === '/access/apps' && method === 'GET') return ok(a.apps)
  if (tail === '/access/apps') {
    const n = a.apps.length + 1
    const app = { ...(body as { name: string }), id: `app_${n}`, aud: String(n).repeat(64) }
    a.apps.push(app)
    return ok(app)
  }
  const put = /^\/access\/apps\/(.+)$/.exec(tail)
  const old = put && method === 'PUT' ? a.apps.find((x) => x.id === put[1]) : undefined
  if (old) {
    Object.assign(old, body)
    return ok(old)
  }
  return { status: 404, body: null }
}
