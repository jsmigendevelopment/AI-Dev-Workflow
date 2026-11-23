# Staying in the loop: pings, the board and automation

Agents work in many threads at once. You shouldn't have to watch any of them. This page covers three things:

- when an agent interrupts you;
- the one page that shows everything;
- how much the agents do without you.

## 🔔 When agents interrupt you

| Level | Means | You get |
|---|---|---|
| 🛑 **Blocker** | It can't go on without you: the always-stop list, an unclear MVP core, a critical security finding, production down, or nothing else can move. | A ping right away. The agent keeps doing other safe work. |
| ⏳ **Decision** | It needs your call, but other work can move: a schema or API gate, taste, scope or money, a stuck review, an unclear issue, a stale claim. | One batched ping at most every 30 minutes. The issue gets the `needs-human` label. |
| ℹ️ **FYI** | Merged and ready to try, usage, a rate limit and when it resets. | No ping. It's on the board and in `/back`. |

Every ping reads the same way:

```text
Needs you · notes-app · Public links or invite only?

1. Should anyone with the link see a shared note?
   Recommended: invite only, because notes can be private.

If you don't answer: #14 stays parked. The loop keeps building #15 and #16.
https://github.com/you/notes-app/issues/14
```

**Answer** in the thread, or in a comment on the issue. The loop reads comments on its next sweep.

**While you're away** (`/afk`), only critical blockers ping: production down, or a live security hole. Everything else waits for `/back`.

**Your settings** are in your profile, `~/.onrails/profile.toml`:

```toml
[notify]
ping = "decisions"         # decisions | blockers | critical
batch_minutes = 30
quiet_hours = "22:00-07:00"
desktop = true
```

**On your phone:** set `NTFY_TOPIC` to a long random name, install the free ntfy app, and subscribe to the same name.

Agents call `node .claude/hooks/notify.mjs`. It also runs as the Claude Code notification hook, so permission prompts follow the same rules.

## 📋 The board

One page per project, `~/.onrails/boards/<project>.md`. Keep it open instead of watching threads.

```markdown
# 📋 notes-app · board

**Presence:** 🌙 away since 22:10 (night · building pass 1)

## 🛑 Needs you now
- #16 · Test deploy fails: CLOUDFLARE_API_TOKEN missing · `coordinator` · since 08:31 (9 min)

## ⏳ Waiting on your decision
- #14 · Public links: anyone with the link, or invited only? · `builder-14` · since 07:30

## 🔨 Being built
- #19 · Search notes · `claimed on GitHub` · since 08:15 (25 min)

## 🔍 In review
- #12 · PR #31 · Notes list · code review: approve @ 4f2a9c1 · `builder-12` · since 08:05

## ✅ Merged today
- #10 · PR #29 · Sign-in page · 05:10

## ℹ️ FYI
- 08:30 · Usage 62% · resets 18:00
```

- **Who writes it:** every agent adds a line to an event log when it starts, opens a pull request, finishes or needs you. The coordinator redraws the page after each sweep, from that log plus the GitHub lists it already fetched. No extra API calls.
- **Cloud threads** can't reach your home folder. They use GitHub labels (`needs-human`, `blocker`, `status:in-progress`), and the board picks those up.
- **Old items** roll off after a day.
- **It's never in the repo.** Move it with `[board] dir = "<folder>"`, for example a Google Drive folder you can open on your phone.

## 📊 The board as a Google Sheet

Want to see it from your phone, and let cloud threads update it? Set:

```toml
[board]
sheet = "https://docs.google.com/spreadsheets/d/..."
```

An agent with the Google Sheets connector offers to make one the first time.

- **One tab per project,** plus an **All projects** tab that stacks them with a formula.
- **Clean by default:**
  - an "Updated <time> · presence <status>" line at the top;
  - a frozen header;
  - a colour per section (red needs you now, amber waiting on you, blue being built, purple in review, green merged today, grey FYI);
  - light banding;
  - links you can tap.
- **Formatting is set once,** when the tab is made.
- **Each sweep rewrites only the values:** one clear and one write. Sheets allows about 60 writes a minute per user, and a sweep every 10 minutes uses 2.
- **Who writes it:**
  - agents with the connector, cloud ones included, write the sheet;
  - agents without it write `board.md`;
  - the next agent with the connector catches the sheet up.
- The sheet step hasn't been tested end to end yet. Check the first one by eye.

The exact steps are in [`.agents/skills/coordinate/board.md`](../.agents/skills/coordinate/board.md).

## 🎚️ How much agents do on their own

You pick this first, in `/idea` or `/join`. Change it any time with `/automation`, or just say "switch to recommended".

| Level | Agents do | You do |
|---|---|---|
| **Recommended** (default) | Run the loop. Build, review and merge the tiny and normal lanes. Deploy to test. | Approve the risky lane and schema changes. Answer batched decisions. Try the app. |
| **Full automation** | Everything, the risky lane too, plus overnight. Never the always-stop list. | Answer blockers. |
| **Hands-on** | Plan, write issues, build one issue when you ask. | Open and merge every pull request. |
| **Custom** | You set each switch: the loop, who merges each lane, who opens pull requests, overnight, the ping level. | |

- **The automation level** is how much agents do without you.
- **The risk dial** is how careful each merge is.
- When the two disagree, the more careful one wins.
- Got real users? Move from Full to Recommended.

<p align="center"><sub><a href="../README.md">← Back to the README</a> · <a href="cheat-sheet.md">Cheat sheet</a></sub></p>
