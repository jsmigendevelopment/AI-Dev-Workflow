# Stack

Picked in the tech grill. Every choice says whether it was the recommended default or the person's own call.

| Area | Choice | Alternatives considered | Default or chosen | Why |
|---|---|---|---|---|
| Platform(s) |  |  |  |  |
| Framework |  |  |  |  |
| UI kit and styling |  |  |  |  |
| API style |  |  |  |  |
| Database |  |  |  |  |
| Auth |  |  |  |  |
| Hosting and deploy |  |  |  |  |
| Environments (test, prod) |  |  |  |  |
| Testing |  |  |  |  |
| Other SaaS / libraries |  |  |  |  |

## Build vs buy

For each need: open source first, then a free-tier SaaS, then build it.

| Need | Open source? | Free-tier SaaS? | Decision |
|---|---|---|---|
|  |  |  |  |

## Repo

- Visibility: private / public
- Licence: none / MIT / other

## Risk dial

How carefully changes are gated. Pick one.

- [ ] **Move fast:** startup or side project, no real users yet. Agents merge after automated review, and the person reviews by using the app.
- [ ] **Careful:** real users or real money. The person reads every schema and migration change and skims every API change before merge.
- [ ] **Strict:** bank, health, or anything regulated. The person approves every merge, and there's a second human reviewer for security.

Whatever the dial, the **always-stop list** in `AGENTS.md` still applies: production, secrets, real data and money always wait for the person.

## Environments

- Test URL: 
- Preview per pull request: yes / no
- Production: deployed by the person only
