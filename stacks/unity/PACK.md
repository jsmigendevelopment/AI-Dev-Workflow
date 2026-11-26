# Stub pack: Unity game

**Stub pack. Not built yet. Researched 2026-11-22 (fact-checked). Re-check versions before building.**

**Confidence: medium** that assembly-definition modules are the right shape. **Low to medium** that GameCI's `unityci/editor` Docker images, run from the session or on a build machine, carry the checks. This way is untested: the research assumed GameCI's actions, and onRails runs no GitHub Actions (#98). **Low** that agents can build much beyond game logic alone. Tell the person this before they choose it.

Source: `research/platform-packs.md`, section 4, and fact-check rows 50 to 64. Marks: [V] verified, [S] secondary, [I] inferred, as in the dossier.

## When to choose it

Choose it when:

- the person already uses Unity, or needs its asset store, platforms or tooling;
- most of the agent's work is game logic, data and the checks, and a person will do the scenes, art and play-testing.

Don't choose it when:

- the engine choice is still open and agents should do most of the work. Godot keeps scenes as readable text and needs no licence step on a build machine [I]. That deserves its own `research` thread;
- the game is small enough for the web (a canvas or WebGL library in the web pack);
- the person can't accept a licence question for a build machine or a container (see Risks).

Alternatives considered (where the Editor runs the checks; never GitHub Actions):

- **Unity Build Automation:** Unity's own service, handles licences and iOS without a Mac; builds run on Unity's machines, not GitHub Actions; free minutes **unverified**.
- **A build machine with Unity installed** (the person's own, or one they keep), reached from the session: fastest (warm `Library`), one machine to keep alive. Move here when build time becomes the complaint.

Keep a Unity project in its **own repository**, not in the kit's monorepo: different tools, LFS and multi-GB checkouts.

## Pinned versions

| Piece | Version | Re-check with |
|---|---|---|
| Editor | Unity 6.3 LTS, 6000.3.x; newest GameCI image 6000.3.29f1; supported until December 2027 [S] | Unity Hub release notes for 6.3 LTS; `curl -s "https://hub.docker.com/v2/repositories/unityci/editor/tags?name=6000.3&page_size=100" \| jq -r '.results[].name'` |
| GameCI images | `unityci/editor` with `base`, `webgl`, `android`, `ios`, `windows-mono` (also `linux-il2cpp`, `mac-mono`) | the Docker Hub command above |
| Unity Test Framework | the version bundled with 6.3 (**not verified**) | `Packages/packages-lock.json` after first open |
| Scripting backend | Mono for check builds; IL2CPP only for release | |

Version notes:

- **Not Unity 6.6.** It's an update release, supported only until 6.7 arrives [S]. **6.7 LTS** is in beta since 2026-11-19 [S]. Build on 6.3 LTS; upgrade once 6.7 LTS has a few patch releases.
- **GameCI's GitHub Actions are not used** (`unity-test-runner`, `unity-builder`), since onRails runs no GitHub Actions (#98). The `scripts/` recipes call the Editor in the same `unityci/editor` images those actions use, with `docker run` from the session [I].
- Pin the editor in `ProjectSettings/ProjectVersion.txt`. The `scripts/` recipes read it to pick the image tag [I].

## Folder structure

```
Assets/
  _Project/
    Core/                              shared kernel; knows no feature
      Runtime/   Core.asmdef
      Tests/     Core.Tests.asmdef
    Features/
      Inventory/                       the example feature
        Domain/    Inventory.Domain.asmdef      pure C#, noEngineReferences: true
        Runtime/   Inventory.asmdef             MonoBehaviours; references Domain and Core
        Editor/    Inventory.Editor.asmdef      Editor tools and scene builders
        Tests/
          EditMode/  Inventory.Tests.EditMode.asmdef
          PlayMode/  Inventory.Tests.PlayMode.asmdef
    App/           App.asmdef                   the composition root; references features
    Scenes/  Prefabs/  Settings/  Art/
Packages/manifest.json  packages-lock.json
ProjectSettings/
scripts/                               shell scripts behind the check-contract commands
justfile                               the six command names
.gitattributes  .gitignore  .env.example
```

The web folder layout doesn't apply; the rules do:

- **An assembly definition is a module.** Code can only use assemblies in its `references`, and the C# compiler enforces it. "Features don't import each other" becomes "no feature asmdef lists another feature".
- Set `autoReferenced: false` everywhere, so nothing leaks in by default [I].
- **`Domain` sets `noEngineReferences: true`.** Game rules stay free of `UnityEngine`. That's the Unity version of "services hold rules, not SDKs".
- **Layering inside a feature:** `Runtime` (the controller: input, MonoBehaviours, views) calls `Domain` (the service: rules), which reaches storage or network through an interface that `App` wires up.
- **The boundary check** is the compiler plus one EditMode test. The test reads every `.asmdef` (they're JSON) and fails if a `Features/X` assembly references `Features/Y`, or if anything other than `App` references two features. About forty lines. No maintained tool was found [I], so this is the one hand-rolled check. Prove it fails on a deliberate bad reference.

## Check contract

Unity has no script runner. The six names are `justfile` recipes that call scripts in `scripts/`. Most need a Unity Editor, which an agent's Linux sandbox normally doesn't have. With Docker, GameCI's `unityci/editor` image provides it from the session; without it, the recipes run on a build machine that has the Editor.

| Command | Runs | Needs an Editor? |
|---|---|---|
| `lint` | `dotnet format whitespace --folder Assets/_Project --verify-no-changes`; `scripts/check-meta.sh` (fails on a missing or orphaned `.meta`); the asmdef rule test, in the Editor | whitespace and `.meta`: no |
| `typecheck` | Unity batch mode compiling the project, warnings as errors | yes |
| `test` | EditMode tests (`-runTests -testPlatform EditMode`) | yes |
| `test:e2e` | PlayMode tests (`-testPlatform PlayMode`) plus a smoke test that loads every scene in the build | yes |
| `build` | a batch-mode build (`-buildTarget` and an `Editor` build method [I]) for one cheap target: `StandaloneLinux64` or WebGL | yes |
| `check` | `lint`, `typecheck`, `test`, `build` (not `test:e2e`) | yes |

Local batch-mode commands, for a machine with the Editor [I: standard Unity command-line flags; check the 6.3 manual]:

```sh
# typecheck: open, compile, quit; the log shows compile errors
Unity -batchmode -nographics -quit -projectPath . -logFile -
# test (EditMode); swap the platform for PlayMode. Don't add -quit with -runTests
Unity -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults artifacts/editmode.xml -logFile -
```

Warnings as errors need a compiler response file in `Assets/` (for example `csc.rsp` with `-warnaserror+`) [I]. Confirm it works on 6.3 before relying on it.

Where e2e is weaker than web: PlayMode tests check behaviour, not how the game looks, feels or plays. There's no equivalent of the `qa` browser check. **Below Full, a person plays every build that matters.** Acceptance checks tagged `agent` on the web pack mostly become checks for a human here. What a human checks: the main loop is fun and readable, controls feel right, art and audio load, performance is acceptable on the target device, and each target platform's build launches. **On Full,** run the parts an agent can: the PlayMode tests, and each target's build launched headless where the runner has that platform. Record what no person played (fun, feel, art, audio, the device) on the pull request as "AI pick, not reviewed", merge on the reviews, and add a "play this build" line to the FYI.

## Auth and backend

Most games need no account. Below Full, ask first. On Full, add one only when the MVP needs it, record it as "AI pick, not reviewed" and put it in the FYI.

If the game needs one (cloud saves, leaderboards, purchases), it's a client of the web pack's `/api/v1` routes (being added to the web pack), with a Clerk session token as `Authorization: Bearer <token>`.

**The dossier did not research Clerk for Unity.** No Clerk Unity SDK was checked. Don't guess: send "how does a Unity client sign in with Clerk" to the `research` skill before building it. Never put a server secret in a game build; anything in the build can be extracted.

## Checks and release (no GitHub Actions)

**Licence activation.** The Editor needs an activated licence wherever it runs, in GameCI's images too [V for GameCI's actions].

- *Personal:* activate in Unity Hub on your machine, put the `.ulf` file's contents in `UNITY_LICENSE`, and `UNITY_EMAIL` and `UNITY_PASSWORD`, in a git-ignored `.env.local` through the `secrets` checklist, then sign out of Hub so your machine releases the seat [V]. Hub doesn't always produce a `.ulf`; GameCI points to its Discord for workarounds [V].
- *Pro:* a serial in `UNITY_SERIAL`. *Enterprise:* a licence server URL [V].
- **Whether Personal may be used on a build machine or in a container is unverified.** Unity's compliance page says build machines need a separate licence [S]. Ask the person to read Unity's terms, or use a paid seat. Personal is for revenue and funding under $200,000 a year [S].

Licence values (names only, the `secrets` skill's format; in the shell or a git-ignored `.env.local`, never GitHub):

```bash
# Unity licence file contents (Personal) · get it: Unity Hub → Manage licences, then the .ulf file · scope: test,production · secret: yes
UNITY_LICENSE=
# Unity account email and password · get it: your Unity ID · scope: test,production · secret: yes
UNITY_EMAIL=
UNITY_PASSWORD=
# Unity Pro serial, only with a paid seat · get it: Unity ID → Subscriptions · scope: test,production · secret: yes
UNITY_SERIAL=
```

How the checks run (from the session: `coordinate`'s local gate):

- **Every pull request:** the gate's `check` (`lint`, then `typecheck`, EditMode tests and a build for Linux or WebGL) and `test:e2e` (PlayMode tests), in the `unityci/editor` image with `docker run`, or on the build machine. Results go to an `artifacts` folder, and the gate's `Checks:` comment names them.
- **After each merge:** `coordinate` step 8's "Check main" runs the install and `check` again on main's own commit.
- **Platforms [V for GameCI's images]:** the Linux image builds WebGL, Android, Linux and Windows (Mono). Windows IL2CPP needs a Windows machine. macOS and iOS need a Mac.
- **Keep `Library/`** between runs: on the build machine, or in a Docker volume per target. A warm `Library/` turns a cold 15 to 40 minutes into a few [I].

**Git LFS:**

- GitHub Free and Pro include 10 GiB storage and 10 GiB bandwidth a month. At a $0 budget LFS is blocked for the rest of the month once used [V].
- Every fresh clone spends LFS bandwidth. The gate's worktrees share their clone's LFS objects, so each machine fetches them once [I].
- Track binaries in LFS (`*.png`, `*.psd`, `*.fbx`, `*.wav`, `*.mp4`). Never `.unity`, `.prefab`, `.asset` or `.meta`: they're text. Use Force Text serialisation, Visible Meta Files, and UnityYAMLMerge as the merge tool [I].
- Ignore `Library/`, `Temp/`, `Obj/`, `Logs/`, `UserSettings/` and build output.

**Costs:** a cold build is commonly 15 to 40 minutes [I]. On the session's machine or a build machine it uses no GitHub minutes; a Mac for iOS is the person's.

**Deploy:**

- **WebGL to Cloudflare:** each static asset is capped at **25 MiB** [V]. Unity's `.data` file is often bigger: keep the build small or serve big files from R2. Deploy from the session after `wrangler login`, as the web pack does.
- **itch.io** with `butler`, **Steam** with `steamcmd`. The person starts each upload. A release reaches players, like a production deploy, so an agent never runs `butler push` or a `steamcmd` upload on its own. Take their secret names from each tool's docs.
- **Mobile stores** through fastlane; Apple $99 a year, Google Play $25 once. Store accounts cost money: **ask first.**

## Build steps for the agent

1. Tell the person the confidence line above and what a human will do. Ask about the licence (Personal, Pro, or a self-hosted machine) and record it in `docs/decisions.md`.
2. Re-check the versions. Write the pins to `docs/stack.md`.
3. The person creates the project in Unity Hub with 6.3 LTS (the agent can't, without an Editor). They set Force Text and Visible Meta Files, then commit.
4. Add `.gitignore`, `.gitattributes` with LFS rules, and turn on LFS.
5. Lay out the folders above. Write every `.asmdef` with `autoReferenced: false` and `Domain` as `noEngineReferences: true`.
6. Add the `Inventory` example: `Domain` rules with EditMode tests first, a small `Runtime` MonoBehaviour, and a PlayMode test that builds its objects in code.
7. Write an `Editor` script that **generates** the example scene. Never hand-edit `.unity` or `.prefab` YAML. The person runs it once and commits the scene.
8. Write the asmdef boundary test. Add a deliberate bad reference locally, see it fail, remove it.
9. Add `scripts/check-meta.sh`, the other `scripts/` and the `justfile` with the six names, each running the Editor in `unityci/editor` (Docker) or on the build machine.
10. The person puts the licence values in a git-ignored `.env.local` with the `secrets` checklist (they type the values; never in chat). Nothing goes to GitHub.
11. Add no `.github/workflows/`. Write `ci = "local"` in `docs/stack.md`: `coordinate` runs the `justfile` recipes before each merge.
12. Fill in "Commands that work here" in `AGENTS.md`, saying which commands need an Editor.
13. Slice 0 is done when every check-contract command passes in the local gate (the Docker image or the build machine).
14. Offer to contribute the starter back to the kit: `stacks/unity/` with the asmdefs, example feature, scene generator, `scripts/` and the `justfile`, plus a `stack-unity` skill. No licence files, no project names, nothing private.

## Known risks and unverified items

- **Licence terms for build machines and containers:** unverified. Activation has broken before when Unity changed Hub [S].
- **Unity 6.6 date and support window, 6.7 LTS timing:** secondary only.
- **Unity Build Automation free minutes:** unverified.
- **Unity's MCP server** (`com.unity.ai.assistant` 2.0, beta since May 2026 [S]): lets an agent drive an Editor open on the person's machine. Unverified how well; no use in an unattended run.
- **GameCI is mid-rewrite** (v6) and community-run.
- **Unity Test Framework version, the warnings-as-errors file, `dotnet format` on a Unity project, and `dotnet test` on `Domain` code** are all [I]. Check each in slice 0.

What agents can and can't do reliably here:

| Reliable | Unreliable or not possible |
|---|---|
| C# gameplay logic, especially in `Domain` | Judging how anything looks, feels, sounds or plays |
| EditMode tests, and PlayMode tests that build objects in code | Hand-editing `.unity` and `.prefab` YAML: references break silently |
| Assembly definitions, the package manifest, the `justfile` and its scripts | Creating or renaming assets without breaking `.meta` GUIDs |
| Editor scripts that generate scenes, prefabs and ScriptableObjects | Animation, lighting, level and UI layout by eye |
| ScriptableObject data, shaders and config as text | Anything binary: textures, models, audio |
| Reading an Editor log and fixing a compile error | Running `check` with no Docker and no build machine: the sandbox has no Editor |

The loop is slow: without an Editor in the sandbox, the agent's only feedback is the Docker image or the build machine, at 10 to 20 minutes a round. Keep logic in `Domain` so most of it is tested in seconds.
