<p align="center">
  <img src="../assets/cheat-sheet.svg" alt="onRails cheat sheet: /idea, /join, /back, /afk" width="100%">
</p>

## 💬 Commands

| | With the plugin | With the kit in the project | Codex | Use it when | Or just say |
|---|---|---|---|---|---|
| 💡 | **`/or:idea`** | **`/idea`** | `$idea` | You have an idea for a new app | "I have an idea for an app" |
| 🧭 | **`/or:join`** | **`/join`** | `$join` | You're new to a repo that isn't set up yet | "Help me get set up in this repo" |
| ☀️ | **`/or:back`** | **`/back`** | `$back` | You're starting work, or back from a break | "I'm back" · "pick up where we left off" |
| 🌙 | **`/or:afk`** | **`/afk`** | `$afk` | You're stepping away and want it to keep building | "brb" · "good night" |

> [!TIP]
> **Typing the command always works.** The plain phrase usually does, on a strong model.

**Which one do I type?**

- **`/or:idea`** comes from the onRails plugin. It works in any folder, before the kit is there. The first time, it asks to install the kit into the folder. Then it hands off to the project's copy.
- **`/idea`** is the project's own skill. It works once the kit is installed in the project, with or without the plugin.
- With both, either one runs the project's copy. The project copy wins.

Install the plugin once, for your whole account, from a terminal:

```bash
claude plugin marketplace add jsmigendevelopment/onRails
claude plugin install core@onrails --scope user
```

Inside Claude Code instead? `/plugin marketplace add …` then `/plugin install core@onrails`, and **pick "user"** as the scope. A project install only works in that folder.

Codex: `codex plugin marketplace add jsmigendevelopment/onRails`, then `codex plugin add or@onrails`. Updates are by hand (`claude plugin marketplace update onrails`, then `claude plugin update core@onrails`). Cloud sessions don't load personal plugins; they use the repo's skills. Don't mix the plugin with `init --global`. → [README](../README.md#install-as-a-plugin)

**Adding the kit to an app you already have?** → [Step by step](add-to-existing-app.md)

---

## 🔧 Advanced: run one step yourself

You rarely need these. The four commands call them for you.

| Claude Code | Codex | Use it when |
|---|---|---|
| `/grill` | `$grill` | You want to be interviewed before a big feature, without a full kickoff |
| `/research` | `$research` | A decision is crucial, unclear and costly to undo. It asks first: it uses your strongest model. |
| `/wireframes` | `$wireframes` | You want to see, or change, the screens before they're built. It asks first: it uses your strongest model. |
| `/pyramid` | `$pyramid` | You want to plan the slices and passes, or re-plan at a pass gate. It asks first too. |
| `/issues` | `$issues` | You have a plan, feedback or a bug to turn into issues |
| `/coordinate` | `$coordinate` | You want the build loop to start on the ready issues |
| `/build N` | `$build N` | You want issue N built, and nothing else |
| `/diagnose` | `$diagnose` | Something is broken, failing or slow and nobody knows why. Or say "debug this". |
| `/pr-review N` | `$pr-review N` | You want a fresh review of pull request N |
| `/pr-security N` | `$pr-security N` | Pull request N touches auth, secrets, personal data or money |
| `/qa` | `$qa` | You want a change checked in a real browser, on the preview or the test site |
| `/secrets` | `$secrets` | The app needs API keys or env vars wired up |
| `/stack` | `$stack` | You want to pick the tech, or change a pick |
| `/automation` | `$automation` | You want agents to do more or less on their own. Or say "switch to recommended". |

---

## 🔑 Trigger phrases

| Say | Get |
|---|---|
| "Grill me. Three questions at a time, each with your recommended answer." | A real interview instead of silent guesses |
| "Give me three options with trade-offs and a recommendation." | Choices, not the first idea it had |
| "Use the `<name>` skill." | That skill, every time |
| "Tracer bullets" · "vertical slices" | Thin, end-to-end features you can try right away |
| "Modular monolith" | Feature modules you can split out later |
| "Controller → service → repository" | An API that's easy to test and swap parts in |
| "Review the diff in a fresh context. Don't read the description." | A reviewer that judges the code, not the story |
| "What's out of scope?" | A fence, so it doesn't wander |

---

## 🧠 Model routing

<sub>Example setup, checked 2026-11. Swap in your own models.</sub>

| Job | Tier · effort | Example |
|---|---|---|
| 🗣️ Your live thread (the loop) | Everyday · low | Opus 5.5 low |
| 🔥 Grill, planning chat | Everyday · medium | Opus 5.5 medium |
| 🏛️ CTO: research, pyramid, schema, API, wireframes | **Strongest · high** | Fable 5.2 high |
| 📋 Writing issues from the plan | Everyday · medium | Opus 5.5 medium |
| 🔨 Build an issue | Everyday · low at complexity 1–4, medium at 5–7 or from pass 2 | Opus 5.5 low / medium |
| 🔍 Code review | Never below the builder | Opus 5.5 low / medium |
| 🛡️ Security review (risky only) | One step above review, plus a second vendor for personal data or money | Opus 5.5 medium + ChatGPT |
| 🎨 Art | Creative | ChatGPT |

**Start low. Escalate one step only after a verified failure.**

---

## 🚦 Risk dial and lanes

| Dial | Who merges | Pick it when |
|---|---|---|
| 🟢 **Move fast** | Agents, after the checks pass | Side project or startup, no real users yet |
| 🟡 **Careful** | Agents. The person reads schema and API changes first. | Real users or real money |
| 🔴 **Strict** | The person approves every merge | Bank, health, anything regulated |

| Lane | Checks before merge | When |
|---|---|---|
| **tiny** | CI · code review | Copy, styling, config. No logic. |
| **normal** | CI · code review · QA on the preview | Most issues |
| **risky** | Normal · security review · the person | Auth, secrets, personal data, money, migrations, new dependencies |

🛑 **Always waits for a person, whatever the dial:** production, secrets, deleting or migrating real data, and spending money.

---

## 🎚️ Automation level

The risk dial is how careful each merge is. The automation level is how much agents do without you. The more careful one wins. Asked first in `/idea` and `/join`. Change it with `/automation`.

| Level | Agents do | You do |
|---|---|---|
| **Recommended** | Loop, build, review, merge tiny and normal, deploy to test | Approve risky and schema changes, answer decisions, try it |
| **Full** | Everything, risky too, plus overnight. Never the always-stop list. | Answer blockers |
| **Hands-on** | Plan, write issues, build one issue when asked | Open and merge every pull request |
| **Custom** | You set each switch | |

---

## 🔔 Needs you

| Level | When | Ping |
|---|---|---|
| 🛑 **Blocker** | Always-stop list, unclear MVP core, critical security finding, production down, nothing else can move | Now |
| ⏳ **Decision** | Schema or API gate, taste, scope or money, review cap hit, unclear issue, stale claim | Batched, at most every 30 min |
| ℹ️ **FYI** | Ready to try, usage, rate limit and reset | Never. On the board and at `/back`. |

- Away (`/afk`)? Only production down or a security hole pings.
- Quiet hours and the batch window are in your profile under `[notify]`. Phone pings: set `NTFY_TOPIC`.
- **The board:** `~/.onrails/boards/<project>.md`, or a Google Sheet with `[board] sheet`. Keep it open instead of watching threads.

→ [Pings, the board and automation](staying-in-the-loop.md)

---

<p align="center"><sub><a href="../README.md">← Back to the README</a> · made by <a href="https://me.jsmigen.dev">jay</a></sub></p>
