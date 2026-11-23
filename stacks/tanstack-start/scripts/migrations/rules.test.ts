import { describe, expect, it } from 'vitest'

import { lintMigrations } from './rules'

const NOTES = `CREATE TABLE \`notes\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`owner_id\` text NOT NULL,
	\`title\` text NOT NULL,
	\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX \`notes_owner\` ON \`notes\` (\`owner_id\`);`

const rules = (...later: string[]) =>
  lintMigrations([NOTES, ...later].map((sql, i) => ({ name: `000${i}_m.sql`, sql }))).map((f) => f.rule)

describe('migration lint', () => {
  it('passes a new table and a nullable or defaulted column', () => {
    expect(
      rules(
        'ALTER TABLE `notes` ADD `body` text;',
        "ALTER TABLE `notes` ADD `status` text DEFAULT 'open' NOT NULL;",
        'CREATE TABLE `prices` (`id` text PRIMARY KEY NOT NULL, `amount_cents` integer NOT NULL, `currency` text NOT NULL);',
      ),
    ).toEqual([])
  })

  it('flags a dropped column, including one lost when drizzle rebuilds a SQLite table', () => {
    expect(rules('ALTER TABLE `notes` DROP COLUMN `title`;')).toEqual(['dropped-column'])
    const rebuild = `CREATE TABLE \`__new_notes\` (\`id\` text PRIMARY KEY NOT NULL, \`owner_id\` text NOT NULL, \`created_at\` integer NOT NULL);
--> statement-breakpoint
INSERT INTO \`__new_notes\`("id", "owner_id", "created_at") SELECT "id", "owner_id", "created_at" FROM \`notes\`;
--> statement-breakpoint
DROP TABLE \`notes\`;
--> statement-breakpoint
ALTER TABLE \`__new_notes\` RENAME TO \`notes\`;`
    expect(rules(rebuild)).toEqual(['dropped-column'])
  })

  it('accepts a rebuild that keeps every column', () => {
    const keep = NOTES.split('--> statement-breakpoint')[0]!.replace('`notes`', '`__new_notes`')
    expect(
      rules(
        `${keep}\n--> statement-breakpoint\nDROP TABLE \`notes\`;\n--> statement-breakpoint\nALTER TABLE \`__new_notes\` RENAME TO \`notes\`;`,
      ),
    ).toEqual([])
  })

  it('flags NOT NULL without a default, added or set later', () => {
    expect(rules('ALTER TABLE `notes` ADD `body` text NOT NULL;')).toEqual(['not-null-without-default'])
    expect(rules('ALTER TABLE "notes" ALTER COLUMN "title" SET NOT NULL;')).toEqual([
      'not-null-without-default',
    ])
  })

  it('flags a renamed table or column, and a dropped table', () => {
    expect(rules('ALTER TABLE `notes` RENAME TO `memos`;')).toEqual(['renamed-table'])
    expect(rules('ALTER TABLE `notes` RENAME COLUMN `title` TO `name`;')).toEqual(['renamed-column'])
    expect(rules('DROP TABLE `notes`;')).toEqual(['dropped-table'])
  })

  it('flags money in a float or decimal column, in SQLite and Postgres', () => {
    expect(rules('ALTER TABLE `notes` ADD `price` real;')).toEqual(['float-money'])
    expect(rules('CREATE TABLE "orders" ("id" text PRIMARY KEY, "total" numeric(10, 2) NOT NULL);')).toEqual([
      'float-money',
    ])
    expect(rules('ALTER TABLE `notes` ADD `weight` real;')).toEqual([])
  })

  it('accepts a rule on purpose only with a reason and an issue number', () => {
    const drop = 'ALTER TABLE `notes` DROP COLUMN `title`;'
    expect(rules(`-- migration-lint-allow dropped-column: never shipped (#12)\n${drop}`)).toEqual([])
    expect(rules(`-- migration-lint-allow dropped-column: never shipped\n${drop}`)).toEqual([
      'dropped-column',
    ])
  })
})
