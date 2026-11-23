// The app's own lint rules, for what no maintained plugin checks the way the code style wants.
// Each is small; its test is a deliberate violation in a scratch copy (see the stack skill).

const ISSUE = /\(#\d+\)/
const WARNING_WORD = /\b(TODO|FIXME|XXX|HACK)\b(?!\(#\d+\))/

/** Every warning comment names its issue, as in `TODO(#42): ...`. Without one, nobody tracks it. */
const todoNeedsIssue = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require an issue number on every TODO, FIXME, XXX and HACK comment' },
    schema: [],
    messages: { bare: '{{word}} needs an issue number: {{word}}(#123): what and why.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = WARNING_WORD.exec(comment.value)
          if (match) context.report({ loc: comment.loc, messageId: 'bare', data: { word: match[1] } })
        }
      },
    }
  },
}

/**
 * An exception to a lint rule is a decision: `// eslint-disable-next-line <rule> -- <reason> (#123)`.
 * The plugin's require-description checks the reason exists; this checks it names an issue.
 */
const exceptionNeedsIssue = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a reason and an issue number on every eslint-disable comment' },
    schema: [],
    messages: { bare: 'Say why and link the issue: eslint-disable-next-line <rule> -- <reason> (#123).' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim()
          if (!/^eslint-disable/.test(text)) continue
          const reason = text.split(/\s--\s/)[1] ?? ''
          if (!ISSUE.test(reason)) context.report({ loc: comment.loc, messageId: 'bare' })
        }
      },
    }
  },
}

export default {
  meta: { name: 'local' },
  rules: { 'todo-needs-issue': todoNeedsIssue, 'exception-needs-issue': exceptionNeedsIssue },
}
