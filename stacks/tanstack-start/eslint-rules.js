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

/**
 * Routes render fully on the server by default (`ssr: true`, which is never written out). A route
 * that sets `ssr: false`, `'data-only'` or a function says why in a comment right above it.
 */
const ssrNeedsReason = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a reason comment on every route ssr option other than the default' },
    schema: [],
    messages: {
      redundant: '`ssr: true` is the default. Leave it out.',
      bare: 'Say why this route is not fully server-rendered, in a comment above `ssr:`.',
    },
  },
  create(context) {
    return {
      'Property[key.name="ssr"]'(node) {
        if (node.parent.type !== 'ObjectExpression' || node.parent.parent.type !== 'CallExpression') return
        if (node.value.type === 'Literal' && node.value.value === true)
          return context.report({ node, messageId: 'redundant' })
        if (context.sourceCode.getCommentsBefore(node).length === 0)
          context.report({ node, messageId: 'bare' })
      },
    }
  },
}

// Config pieces for eslint.config.js, kept here so that file stays readable.

// Links and navigation stay type-safe: the router checks `to` against the route tree, and
// `params` and `search` against each route's schemas. A raw `<a href="/...">` or a path built
// from a string skips all three, so a renamed route breaks at runtime instead of in typecheck.
const BUILT_PATH = 'TemplateLiteral[expressions.length>0], BinaryExpression[operator="+"]'
export const routing = [
  {
    selector:
      'JSXOpeningElement[name.name="a"] > JSXAttribute[name.name="href"]:matches([value.value=/^\\//], [value.expression.value=/^\\//], [value.expression.type="TemplateLiteral"][value.expression.quasis.0.value.raw=/^\\//])',
    message: 'An internal link: use <Link to="/path"> from @tanstack/react-router, not <a href>.',
  },
  {
    selector: `:matches(Property[key.name="to"], JSXAttribute[name.name="to"] > JSXExpressionContainer) > :matches(${BUILT_PATH})`,
    message: 'A path built from a string: pass `to="/notes/$noteId"` with `params={{ noteId }}` instead.',
  },
  {
    selector: `CallExpression:matches([callee.name="navigate"], [callee.property.name="navigate"]) > :matches(Literal, ${BUILT_PATH}).arguments`,
    message: 'Navigate with an object: navigate({ to: "/path", params, search }), never a string.',
  },
]
/** For Zustand stores: server data and its types stay in TanStack Query (the module hooks). */
export const storeImports = {
  regex:
    '^@tanstack/(react-)?query|/hooks/|^\\.\\./hooks|/server/|^\\.\\./server|^@/server|(^|/)types$|\\.functions$',
  message:
    'A store holds client-only state. Server data and its types stay in TanStack Query (the module hooks).',
}

export default {
  meta: { name: 'local' },
  rules: {
    'todo-needs-issue': todoNeedsIssue,
    'exception-needs-issue': exceptionNeedsIssue,
    'ssr-needs-reason': ssrNeedsReason,
  },
}
