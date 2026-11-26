// The smoke tests' Access service token: made only when .env.cloudflare.local can take its
// secret, and deleted again when the secret couldn't be saved, so no token exists that nobody holds.
import { type AccessContext, ghSecret, localPrefix, results, saveForDeploys } from './access.ts'
import { LOCAL_FILE } from './local-env.ts'

/** A service token for the smoke tests, saved where the deploys read it. No id: it wasn't made. */
export async function ensureServiceToken(
  ctx: AccessContext,
  worker: string,
  envs: string[],
): Promise<{ id?: string; ok: boolean }> {
  const { deps, log, a } = ctx
  const name = `${worker} CI`
  const prefix = localPrefix(envs)
  const keys = [`${prefix}CF_ACCESS_CLIENT_ID`, `${prefix}CF_ACCESS_CLIENT_SECRET`]
  const names = keys.join(' and ')
  const tokens =
    results<{ id: string; name: string }[]>(await deps.api('GET', `${a}/access/service_tokens`)) ?? []
  const found = tokens.find((t) => t.name === name)
  if (found) {
    log(
      keys.every((key) => deps.hasLocal(key))
        ? `exists  service token "${name}" (${names} in ${LOCAL_FILE})`
        : `exists  service token "${name}", but ${LOCAL_FILE} lacks ${names}. Cloudflare shows its secret only once: refresh the token in Zero Trust → Service credentials and put both values there.`,
    )
    return { id: found.id, ok: true }
  }
  const problem = deps.localProblem(!ctx.dryRun)
  if (problem) {
    log(
      `  ${problem} Cloudflare shows a token's secret only once, so ${ctx.dryRun ? 'a real run makes no token' : 'no token was made'}.`,
    )
    return { ok: false }
  }
  const github = ctx.github.actions
    ? `, and in the GitHub environment${envs.length > 1 ? 's' : ''} ${envs.join(' and ')}`
    : ''
  log(
    `${ctx.dryRun ? 'would create' : 'creating'} service token "${name}" (1 year) and save it in ${LOCAL_FILE} as ${names}${github}. Its secret is never printed.`,
  )
  if (ctx.dryRun) return { ok: true }
  const token = results<{ id: string; client_id: string; client_secret: string }>(
    await deps.api('POST', `${a}/access/service_tokens`, { name, duration: '8760h' }),
  )
  if (!token) {
    log('  could not create the service token. Check the token permissions above.')
    return { ok: false }
  }
  const values = { CF_ACCESS_CLIENT_ID: token.client_id, CF_ACCESS_CLIENT_SECRET: token.client_secret }
  const failed = saveForDeploys(deps, log, prefix, values)
  if (failed) return deleteToken(ctx, name, token.id, failed)
  if (ctx.github.gh)
    for (const [key, value] of Object.entries(values)) await ghSecret(deps, log, key, value, envs)
  else if (ctx.github.actions)
    log(`  GitHub CLI not signed in: set both in GitHub by hand, from ${LOCAL_FILE}.`)
  return { id: token.id, ok: true }
}

/** A token whose secret is stored nowhere is no use to anyone: delete it, then stop the run. */
async function deleteToken(ctx: AccessContext, name: string, id: string, failed: string): Promise<never> {
  const deleted = await ctx.deps.api('DELETE', `${ctx.a}/access/service_tokens/${id}`)
  const fix = `make sure you can write ${LOCAL_FILE}, then run this again.`
  throw new Error(
    deleted.status < 300 && deleted.body?.success !== false
      ? `${failed}, so the new service token "${name}" was deleted in Cloudflare. Nothing was stored. To fix it, ${fix}`
      : `${failed}, and deleting the new service token failed too. Delete "${name}" in Zero Trust → Service credentials, ${fix}`,
  )
}
