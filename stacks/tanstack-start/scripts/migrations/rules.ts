// The migration lint: changes that break the running app mid-deploy or lose data. A rollback
// restores code, never data, so these need expand-then-contract instead (app-conventions rule 12).
// It replays every migration in order, so it knows each table's columns when one is rebuilt.

export const RULES = {
  'dropped-column': 'drops a column: stop using it in one release, drop it in a later one',
  'dropped-table': 'drops a table: stop using it in one release, drop it in a later one',
  'renamed-table': 'renames a table: add the new one, copy, switch the code, then drop the old one',
  'renamed-column': 'renames a column: add the new one, backfill, switch the code, then drop the old one',
  'not-null-without-default':
    'makes a column NOT NULL with no DEFAULT: existing rows fail. Add it nullable, backfill, then require it',
  'float-money': 'stores money in a float or decimal column: use an integer of minor units (`*_cents`)',
} as const

export type Rule = keyof typeof RULES

export interface Finding {
  file: string
  rule: Rule
  message: string
}

interface Column {
  notNull: boolean
  hasDefault: boolean
}
type Table = Map<string, Column>

const MONEY = /(price|amount|cost|total|fee|balance|money|cents|tax|salary|payment|charge|refund|discount)/i
const FLOAT = /^(real|float|double|numeric|decimal|money)\b/i
const CONSTRAINT = /^(primary\s+key|foreign\s+key|unique|check|constraint)\b/i
// `-- migration-lint-allow <rule>: <reason> (#123)` in a file accepts that rule there, on purpose.
const ALLOW = /--\s*migration-lint-allow\s+([a-z-]+):\s*\S.*\(#\d+\)/g

const unquote = (name: string) => name.replace(/^[`"[]|[`"\]]$/g, '')

/** Top-level comma split: commas inside parentheses (types, checks) stay. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseColumn(def: string): [string, Column, string] | null {
  if (CONSTRAINT.test(def)) return null
  const match = /^([`"[]?[\w]+[`"\]]?)\s*(.*)$/s.exec(def)
  if (!match) return null
  const rest = match[2] ?? ''
  return [
    unquote(match[1] ?? ''),
    {
      notNull: /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest),
      hasDefault: /\bdefault\b/i.test(rest),
    },
    rest,
  ]
}

/** Statements without comments, split on drizzle's breakpoints and on semicolons. */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(/-->\s*statement-breakpoint|;/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Every finding across the migrations, in the order they run. Files are `{ name, sql }`, sorted. */
export function lintMigrations(files: { name: string; sql: string }[]): Finding[] {
  const schema = new Map<string, Table>()
  const findings: Finding[] = []
  for (const { name, sql } of files) {
    const allowed = new Set([...sql.matchAll(ALLOW)].map((m) => m[1]))
    const report = (rule: Rule, detail: string) => {
      if (!allowed.has(rule)) findings.push({ file: name, rule, message: `${detail} ${RULES[rule]}` })
    }
    const checkMoney = (table: string, column: string, rest: string) => {
      if (FLOAT.test(rest) && MONEY.test(column)) report('float-money', `${table}.${column}`)
    }
    for (const statement of statements(sql)) applyStatement(statement, { schema, report, checkMoney })
  }
  return findings
}

type Report = (rule: Rule, detail: string) => void
type MoneyCheck = (table: string, column: string, rest: string) => void

interface State {
  schema: Map<string, Table>
  report: Report
  checkMoney: MoneyCheck
}

const ID = '([`"[]?[\\w]+[`"\\]]?)'
const statementRule = (pattern: string, run: (m: string[], state: State) => void) => ({
  pattern: new RegExp(`^${pattern}`, 'is'),
  run,
})

/** Each statement shape the lint understands, and what it checks. Anything else is ignored. */
const STATEMENTS = [
  statementRule(`create table (?:if not exists )?${ID} \\((.*)\\)`, ([, name = '', body = ''], s) => {
    const table = unquote(name)
    const columns: Table = new Map()
    for (const def of splitTop(body)) {
      const parsed = parseColumn(def)
      if (!parsed) continue
      columns.set(parsed[0], parsed[1])
      s.checkMoney(table, parsed[0], parsed[2])
    }
    s.schema.set(table, columns)
  }),
  statementRule(`alter table ${ID} add (?:column )?(.*)$`, ([, name = '', def = ''], s) => {
    const table = unquote(name)
    const parsed = parseColumn(def)
    if (!parsed) return
    if (parsed[1].notNull && !parsed[1].hasDefault)
      s.report('not-null-without-default', `${table}.${parsed[0]}`)
    s.checkMoney(table, parsed[0], parsed[2])
    s.schema.get(table)?.set(parsed[0], parsed[1])
  }),
  statementRule(
    `alter table ${ID} drop (?:column )?(?:if exists )?${ID}`,
    ([, table = '', column = ''], s) => {
      if (!/^constraint$/i.test(column)) s.report('dropped-column', `${unquote(table)}.${unquote(column)}`)
    },
  ),
  statementRule(`alter table ${ID} alter column ${ID} set not null`, ([, table = '', column = ''], s) =>
    s.report('not-null-without-default', `${unquote(table)}.${unquote(column)}`),
  ),
  statementRule(
    `alter table ${ID} alter column ${ID} (?:set data )?type (.*)$`,
    ([, t = '', c = '', type = ''], s) => s.checkMoney(unquote(t), unquote(c), type),
  ),
  statementRule(`alter table ${ID} rename column ${ID} to ${ID}`, ([, table = '', column = ''], s) =>
    s.report('renamed-column', `${unquote(table)}.${unquote(column)}`),
  ),
  statementRule(`alter table ${ID} rename to ${ID}`, ([, from = '', to = ''], s) =>
    renameTable(unquote(from), unquote(to), s.schema, s.report),
  ),
  statementRule(`drop table (?:if exists )?${ID}`, ([, name = ''], s) => {
    const table = unquote(name)
    // Drizzle rebuilds a SQLite table as __new_<table>, then drops and renames: checked at the rename.
    if (!s.schema.has(`__new_${table}`)) s.report('dropped-table', table)
  }),
]

function applyStatement(statement: string, state: State) {
  for (const { pattern, run } of STATEMENTS) {
    const match = pattern.exec(statement)
    if (match) return run([...match], state)
  }
}

function renameTable(from: string, to: string, schema: Map<string, Table>, report: Report) {
  const rebuilt = schema.get(from)
  if (from !== `__new_${to}` || !rebuilt) {
    report('renamed-table', `${from} → ${to}`)
  } else {
    const before = schema.get(to) ?? new Map<string, Column>()
    for (const column of before.keys()) if (!rebuilt.has(column)) report('dropped-column', `${to}.${column}`)
    for (const [column, info] of rebuilt) {
      const old = before.get(column)
      const nowRequired = info.notNull && !info.hasDefault && (!old || !old.notNull)
      if (nowRequired) report('not-null-without-default', `${to}.${column}`)
    }
  }
  schema.set(to, rebuilt ?? schema.get(to) ?? new Map<string, Column>())
  schema.delete(from)
}
