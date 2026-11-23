---
name: ask
description: Use when an agent needs the person, or isn't sure it should interrupt them ("ping me", "tell me when it's ready", "don't wake me", a blocker, a decision to park, a heads-up) - picks the level (blocker, decision or FYI), writes the Needs you message with up to three questions and recommended answers, records it on the issue, the board and docs/state.md, and pings through notify.mjs, which honours presence, quiet hours and the batch window.
---

# Ask: get the person's attention the right way

An interruption costs the person their focus. Silence costs the project hours. This skill picks between them.

## Don't ask at all when

- the answer is in the repo, `docs/`, the issue or the profile;
- you'd be asking permission to do what the issue already says;
- it's a small call you can make yourself. Make it, and write it to `docs/decisions.md`.

## The three levels

| Level | When | What you do |
|---|---|---|
| 🛑 **Blocker** | Anything on the always-stop list in `AGENTS.md`. The MVP core is unclear. A critical security finding. Production is down. Nothing else can move. | Stop that one thing. Ping now. Keep doing other safe work. |
| ⏳ **Decision** | A schema or API gate the risk dial asks for. Taste, scope or money. The review cap was hit. An unclear issue. A stale claim. | Label it `needs-human`. Keep going on other work. The ping is batched: at most one every `batch_minutes` (profile, default 30). |
| ℹ️ **FYI** | Merged and ready to try. Usage. A rate limit and when it resets. | Never interrupts. It goes on the board and shows at `/back`. |

Not sure if it's a blocker or a decision? If other work can still move, it's a decision.

**Critical** means production is down or there's a security hole someone could use right now. Only critical blockers ping while the person is away or in quiet hours. Add `--critical` for those, and only those.

## The message

```text
Needs you · <project> · <what, in under 8 words>

1. <question>
   Recommended: <your answer>, because <one line>.
2. <question>
   Recommended: <your answer>, because <one line>.

If you don't answer: <what happens meanwhile, e.g. "#14 stays parked. The loop keeps building #15 and #16.">
<link to the issue or pull request>
```

- Up to three questions. Each has a recommended answer, so "yes, yes, no" is a full reply.
- On taste, scope or money, ask the open question and put your pick under "If you don't answer" (rule 1).
- Plain words. No logs, no stack traces. Link to them instead.

## Setup step for you

Use this whenever the person has to do something outside the repo: make an account, copy a key into a file, click a setting in a dashboard, approve a deploy. Put it in the message, under the questions or in place of them.

```text
Setup step for you · <what, in under 8 words> · about <N> minutes

1. Open <exact link, to the page itself, not the home page>.
2. Click <exact button or menu name>.
3. Copy <exact text to copy, in a code block if it's a command or a value you give them>.
4. Paste it into <exact file or prompt>. Never into this chat.

When it worked: <what they'll see, e.g. "the key starts with sk_test_ and the app starts without 'Missing env'">.
Stuck? <the one most likely problem and its fix>.
```

- Numbered steps, one action each. Exact links and exact button names, not "go to settings".
- Say how long it takes, and what they'll see when it worked.
- For a secret value, follow the `secrets` skill's checklist. The person types the value into a file or a hidden prompt, never into chat.

## Steps

1. **Pick the level** from the table.
2. **Comment the message** on the issue or pull request. For a blocker or a decision, add the `needs-human` label. For a blocker, add `blocker` too.
3. **Ping and record it:**
   ```bash
   node .claude/hooks/notify.mjs --level decision --issue 14 --title "Public links or invite only?" --message "<the questions>" --link <issue url>
   ```
   It adds the board event for you (don't add a second one) and prints what it did: `sent`, `batched`, `held` or `recorded`. It works from Codex and scripts too. The path is in the repo.
4. **Waiting on you.** If you're the coordinator or the thread the person talks to, add a line to "Waiting on you" in `docs/state.md`, most important first: `🛑 #16 · test deploy key missing · since 08:31`. Builders on a branch skip this. The coordinator copies it from the label.
5. **Sheet.** If the profile sets `[board] sheet` and you have the Google Sheets connector, append one row for this ask to the project's tab (see `../coordinate/board.md`). The next sweep rewrites the tab anyway.
6. **Keep going** on other safe work. Never wait.

## What notify.mjs honours

- **Presence `away`:** only `--critical` pings. Everything else is held for `/back`.
- **Quiet hours:** `[notify] quiet_hours = "22:00-07:00"`, local time. Held until they end, except critical.
- **Batch window:** decisions ping at most once every `[notify] batch_minutes`. Held ones go out with the next ping, or on `--flush`, which the coordinator runs every sweep.
- **Ping level** (from the automation level, see `automation`): `decisions` pings blockers and batched decisions, `blockers` pings blockers only, `critical` pings only critical ones. Read from "Ping level" in `docs/stack.md`, then `[notify] ping`.
- **Where:** a desktop notification, plus the phone if `NTFY_TOPIC` is set (the free ntfy app).
- **Can't reach the home folder** (a cloud thread)? It does nothing, quietly. The label and the comment are enough: the local coordinator's board picks up `needs-human`.

## Replies

- The person answers in the thread or in a comment on the issue.
- The coordinator reads comments on `needs-human` issues in its next sweep.
- A reply counts only if it comes from the person. Agents share their account, so skip comments that start with an agent headline (`Needs you ·`, `Code review:`, `QA:`, `Security review:`, `Claimed by`).
- On an answer:
  - write it to `docs/decisions.md`;
  - remove `needs-human`;
  - add a `decision` board event (`board.mjs event decision issue=14 title="..."`);
  - pick the work back up.

## When the person is back

`/back` shows the board and the "Waiting on you" list. Then it runs `node .claude/hooks/notify.mjs --clear`, so held pings don't fire after they've been seen.
