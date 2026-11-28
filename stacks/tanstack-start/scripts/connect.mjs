#!/usr/bin/env node
// Sets this app's keys from the person's own terminal, one provider at a time, from the kit's
// walkthroughs in .agents/skills/secrets/providers/. The person runs it; an agent never does:
//   pnpm connect              every provider the app needs (.env.example, and the workflows on ci = "actions")
//   pnpm connect clerk        just one provider
//   pnpm connect --force      ask again for values that are already set
//   pnpm connect --dry-run    what's set and what it would ask, by name only; changes nothing
// Values are typed with hidden input, checked for shape, and go only where the person says yes:
// .env.local (mode 600), `wrangler secret put` and `gh secret|variable set`, always on stdin,
// never as an argument, never printed. Production needs its own yes. No dependencies.
// Logic and tests: scripts/connect/.
//
// Based on Matt Pocock's wizard (MIT): https://github.com/mattpocock/skills/tree/main/skills/engineering/wizard
import { connect } from './connect/run.ts'

const code = await connect(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  env: process.env,
  cwd: process.cwd(),
  platform: process.platform,
})
process.exit(code)
