// A fake world for the connect tests: a real git repository in a temp folder, provider files,
// fake `wrangler`, `gh` and `xdg-open` on PATH that log their argv and stdin, and a fake TTY
// that types one answer each time a question is asked, the way a person would.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { connect } from './run.ts'

export const DEMO = `# Demo

Last checked: 2026-11-23.

\`\`\`json connect
{
  "title": "Demo",
  "url": "https://demo.example.com/keys",
  "vars": {
    "DEMO_SECRET_KEY": { "secret": true, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler", "github"], "shape": { "prefix": ["sk_test_", "sk_live_"], "min": 12 } },
    "DEMO_PUBLIC_ID": { "secret": false, "scope": ["local"], "to": [".env.local"] }
  }
}
\`\`\`

## 1. Keys · about 4 minutes

1. Open the **Keys** page. \`[V]\`
2. Paste this callback: \`[U]\`
   \`\`\`text
   https://demo.example.com/callback
   \`\`\`
3. Store it:
   \`\`\`bash
   gh secret set DEMO_SECRET_KEY --env test
   \`\`\`

When it worked: the demo says hello.

## Why / if it goes wrong

1. Not a step.
`

// Logs argv, stdin and GH_REPO; remembers names per command, kind and environment.
const FAKE = `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
const stdin = (() => { try { return fs.readFileSync(0, 'utf8') } catch { return '' } })()
const cmd = require('path').basename(process.argv[1])
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd, argv, stdin, ghRepo: process.env.GH_REPO }) + '\\n')
const state = fs.existsSync(process.env.FAKE_STATE) ? JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8')) : {}
const env = argv.includes('--env') ? argv[argv.indexOf('--env') + 1] : 'repo'
const key = cmd + ':' + argv[0] + ':' + env
if (argv[1] === 'list') {
  if (process.env.FAKE_LIST_FAIL === cmd) process.exit(1)
  process.stdout.write(JSON.stringify((state[key] || []).map((name) => ({ name }))))
  process.exit(0)
}
if (argv[1] === 'put' || argv[1] === 'set') {
  if (process.env.FAKE_FAIL === key) { process.stderr.write('boom: ' + stdin + '\\n'); process.exit(1) }
  state[key] = [...new Set([...(state[key] || []), argv[2]])]
  fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state))
}
`

export interface Call {
  cmd: string
  argv: string[]
  stdin: string
  ghRepo?: string
}

/** Each answer as typed: the text, then Enter. */
export const typed = (...answers: string[]) => answers.map((a) => `${a}\r`)

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })

/** A TTY that types the next answer shortly after each question, then ends. */
function tty(answers: string[], rawModes: boolean[]) {
  const queue = [...answers]
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(mode: boolean) {
      rawModes.push(mode)
      if (!mode) return
      const next = queue.shift()
      setTimeout(() => (next === undefined ? stdin.end() : stdin.write(next)), 15)
    },
  })
  return stdin
}

function readCalls(dir: string): Call[] {
  try {
    return readFileSync(join(dir, 'calls.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Call)
  } catch {
    return []
  }
}

/** The temp repository: provider files, .env.example, fake tools, and (by default) real git. */
function repository(options: { git?: boolean; ignore?: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'connect-'))
  const providers = join(dir, '.agents/skills/secrets/providers')
  mkdirSync(providers, { recursive: true })
  writeFileSync(join(providers, 'demo.md'), DEMO)
  writeFileSync(join(providers, 'other.md'), DEMO.replace(/DEMO_/g, 'OTHER_').replace('"Demo"', '"Other"'))
  writeFileSync(join(dir, '.env.example'), '# Demo\nDEMO_SECRET_KEY=\nDEMO_PUBLIC_ID=\nUNOWNED=\n')
  mkdirSync(join(dir, 'bin'))
  for (const name of ['wrangler', 'gh', 'xdg-open']) {
    writeFileSync(join(dir, 'bin', name), FAKE)
    chmodSync(join(dir, 'bin', name), 0o755)
  }
  if (options.git !== false) {
    git(dir, 'init', '-q')
    git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git')
    git(dir, 'remote', 'add', 'upstream', 'git@github.com:other/fork.git')
    writeFileSync(join(dir, '.gitignore'), options.ignore ?? '.env.local\n')
  }
  return { dir, providers }
}

export function world(options: { git?: boolean; ignore?: string } = {}) {
  const { dir, providers } = repository(options)
  const rawModes: boolean[] = []

  async function run(args: string[], answers: string[] = [], env: Record<string, string> = {}) {
    const out: string[] = []
    const code = await connect(args, {
      stdin: tty(answers, rawModes),
      stdout: { write: (text: string) => out.push(text) },
      cwd: dir,
      platform: 'linux',
      now: new Date('2026-12-01T00:00:00Z'),
      env: {
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        FAKE_LOG: join(dir, 'calls.jsonl'),
        FAKE_STATE: join(dir, 'state.json'),
        ...env,
      },
    })
    return { code, text: out.join('') }
  }

  const calls = () => readCalls(dir)
  return {
    dir,
    run,
    calls,
    rawModes,
    writes: () => calls().filter((c) => c.argv[1] === 'put' || c.argv[1] === 'set'),
    envLocal: () => readFileSync(join(dir, '.env.local'), 'utf8'),
    provider: (id: string, markdown: string) => writeFileSync(join(providers, `${id}.md`), markdown),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
