import { describe, expect, it } from 'vitest'

import { runSmoke } from './smoke-run.ts'

const node = process.execPath

describe('smoke', () => {
  it('WHEN the started app exits 0 within the limit THEN the smoke start passes', async () => {
    expect(await runSmoke(node, ['-e', 'process.exit(0)'], 5_000)).toEqual({
      ok: true,
      detail: 'exit code 0',
    })
  })

  it('WHEN the started app exits with an error THEN the smoke start fails', async () => {
    expect(await runSmoke(node, ['-e', 'process.exit(3)'], 5_000)).toEqual({
      ok: false,
      detail: 'exit code 3',
    })
  })

  it('WHEN the started app is still running at the limit THEN it is stopped and the smoke start fails', async () => {
    const result = await runSmoke(node, ['-e', 'setTimeout(() => {}, 60_000)'], 300)
    expect(result).toEqual({ ok: false, detail: 'still running after 300 ms' })
  })
})
