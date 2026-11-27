<p align="center">
  <img src="../assets/cheat-sheet.svg" alt="onRails cheat sheet: /idea, /join, /back, /afk" width="100%">
</p>

## 💬 Commands

| | With the plugin | With the kit in the project | Codex | Use it when | Or just say |
|---|---|---|---|---|---|
| 💡 | **`/or:idea`** | **`/idea`** | `$idea` | You have an idea for a new app | "I have an idea for an app" |
| 🧭 | **`/or:join`** | **`/join`** | `$join` | You're new to a repo that isn't set up yet | "Help me get set up in this repo" |
| ☀️ | **`/or:back`** | **`/back`** | `$back` | You're starting work, or back from a break | "I'm back" · "pick up where we left off" |
| 🌙 | **`/or:afk`** | **`/afk`** | `$afk` | You're stepping away and want it to keep building | "going to lunch" · "good night" |
| 🔄 | **`/or:update`** | **`/update`** | `$update` | You want the latest onRails: plugin, global skills and the project's kit | "update onRails" · "get the latest" |

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

Codex: `codex plugin marketplace add jsmigendevelopment/onRails`, then `codex plugin add or@onrails`. To update, type `/update`, or run `npx onrails@latest update --all` in a terminal, then `/reload-plugins`. Cloud sessions don't load personal plugins; they use the repo's skills. Don't mix the plugin with `init --global`. → [README](../README.md#install-as-a-plugin)

**Adding the kit to an app you already have?** → [Step by step](add-to-existing-app.md)

---

## 🔧 Advanced: run one step yourself

You rarely need these. The four commands call them for you.

| Claude Code | Codex | Use it when |
|---|---|---|
| `/grill` | `$grill` | You want to be interviewed before a big feature, without a full kickoff |
| `/research` | `$research` | A decision is crucial, unclear and costly to undo. It asks first: it uses your strongest model. |
| `/wireframes` | `$wireframes` | You want to see, or change, the screens before they're built. Layout first, then the detailed design, which asks first: it uses your strongest model. |
| `/pyramid` | `$pyramid` | You want to plan the slices and passes, or re-plan at a pass gate. It asks first too. |
| `/issues` | `$issues` | You have a plan, feedback or a bug to turn into issues |
| `/coordinate` | `$coordinate` | You want the build loop to start on the ready issues |
| `/build N` | `$build N` | You want issue N built, and nothing else |
| `/diagnose` | `$diagnose` | Something is broken, failing or slow and nobody knows why. Or say "debug this". |
| `/pr-review N` | `$pr-review N` | You want a fresh review of pull request N |
| `/pr-security N` | `$pr-security N` | Pull request N touches auth, secrets, personal data or money |
| `/qa` | `$qa` | You want a change checked in a real browser, on the preview or the test site |
| `/test-by-hand-as-the-user` | `$test-by-hand-as-the-user` | You want an agent to click through a change the way you would, and get a table of each input, what it expected and what it saw |
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

| Role | Default | Does |
|---|---|---|
| **CTO** | Fable 5.2 high | Research, architecture, the pyramid, writing the issues |
| **Coordinator** | Opus 5.5 medium | The loop, gates, reviews, security reviews, merges |
| **Builder** | Sonnet 5.5 medium | Most issues. Opus for risky changes and big slices. Codex outside security. |

**Your profile wins:** `cto`, `coordinator` or `builder` in `[routing]`. Said "no Fable"? `cto = "Claude Opus 5.5"` puts the CTO on Opus.

| Job | Tier · effort | Example |
|---|---|---|
| 🗣️ Your live thread (you talk to it) | Everyday · low | Opus 5.5 low |
| 🔁 The loop (a background sub-agent) | Everyday · medium | Opus 5.5 medium |
| 🔥 Grill, planning chat | Everyday · medium | Opus 5.5 medium |
| ✏️ Wireframes stage 1, layout | Everyday · medium | Opus 5.5 medium |
| 🏛️ CTO: research, pyramid, schema, API, wireframes stage 2 | **Strongest · high** | Fable 5.2 high |
| 📋 Writing issues from the plan (CTO) | **Strongest · high** | Fable 5.2 high |
| 🔨 Build an issue | Fast · medium; Everyday · medium for risky or complexity 5–7 | Sonnet 5.5 medium / Opus 5.5 medium |
| 🔍 Code review | Never below the builder | Opus 5.5 medium |
| 🛡️ Security review (risky only) | One step above review, plus a second vendor for personal data or money | Opus 5.5 medium + ChatGPT |
| 🎨 Art | Creative | ChatGPT |

**Start on the default. Escalate one step per verified failure, two steps at most: Sonnet to Opus, then effort up. Infrastructure errors don't count.**

---

## 🚦 Risk dial and lanes

| Dial | Who merges | Pick it when |
|---|---|---|
| 🟢 **Move fast** | Agents, after the checks pass | Side project or startup, no real users yet |
| 🟡 **Careful** | Agents. Below Full, the person reads schema and API changes first; on Full, an extra review. | Real users or real money |
| 🔴 **Strict** | The person approves every merge (below Full; on Full, an extra review and a security review) | Bank, health, anything regulated |

| Lane | Checks before merge | When |
|---|---|---|
| **tiny** | local gate · code review | Copy, styling, config. No logic. |
| **normal** | local gate · code review · QA on the preview | Most issues |
| **risky** | Normal · security review · the person (below Full; on Full, an extra review) | Auth, secrets, personal data, money, migrations, new dependencies |

🛑 **Always waits for a person, whatever the dial:** production, secrets, deleting or migrating real data, and spending money.

---

## 🎚️ Automation level

The risk dial is how careful each merge is. The automation level is how much agents do without you. Below Full, the more careful one wins. On Full, a careful dial adds reviews, never a person (#103). Asked first in `/idea` and `/join`. Change it with `/automation`.

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
| ⏳ **Decision** | Schema or API gate, taste, scope or money, review cap hit below Full (on Full, `coordinate`'s review cap: nothing parks), unclear issue, stale claim | Batched, at most every 30 min |
| ℹ️ **FYI** | Ready to try, usage, rate limit and reset | Never. On the board and at `/back`. |

- Away (`/afk`)? Only production down or a security hole pings.
- Quiet hours and the batch window are in your profile under `[notify]`. Phone pings: set `NTFY_TOPIC`.
- **The board:** `~/.onrails/boards/<project>.md`, or a Google Sheet with `[board] sheet`. Keep it open instead of watching threads.

→ [Pings, the board and automation](staying-in-the-loop.md)

---

<p align="center"><sub><a href="../README.md">← Back to the README</a> · made by <a href="https://me.jsmigen.dev">jay</a></sub></p>
