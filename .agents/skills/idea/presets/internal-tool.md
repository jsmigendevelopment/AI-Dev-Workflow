# Preset: Internal tool

**For:** a tool used by one team or company.

## Preloaded (confirm, don't ask)

- **Add-ons:** Clerk auth (restricted to the company's email domain or an invite list), Sentry.
- **Floor answers:**
  - no public sign-up;
  - roles (admin and member at least);
  - an audit trail of who changed what;
  - no billing;
  - search engines blocked (noindex);
  - WCAG 2.2 AA.
- **Common slices:** sign-in, a data table with filters, a detail and edit view, roles and invites, an export.
- **Risk:** access control is the risky lane. Every query is scoped to the signed-in user's organisation.

## Still ask

- Who's allowed in, and how they get access.
- What data it reads or writes, and whether it already exists somewhere (an import, or an existing API).
- Which actions need an approval or an undo.
