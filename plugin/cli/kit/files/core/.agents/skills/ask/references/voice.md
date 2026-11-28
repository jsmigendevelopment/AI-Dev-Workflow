# Voice to text: read by sound

Load this when `node .agents/skills/ask/scripts/voice.mjs` prints `input: voice` or `input: both`. Dictation writes words that sound right and read wrong. `input: typing` or `input: unset`? You don't need this file.

## Read by sound

- Hear the words, not the spelling. Take the meaning the sounds fit in this repo.
- Look for:
  - homophones: "to", "two", "too";
  - split or merged words: "sub thread" and "subthread";
  - numbers heard as words, and words heard as numbers: "10 stack" for "TanStack";
  - names heard as common words: "on Rails" for onRails, "signing" for "assigning".
- Check the glossary first, then the repo's own names (`package.json`, `docs/stack.md`, file names).
- **Never correct or comment on the wording.** No "did you mean", no repeating the fix back, no asking them to retype. Use the meaning and go on. "Use 10 stack start" means TanStack Start: write TanStack Start and ask nothing.

## Confirm only in a risky spot

A risky spot is money, deleting, deploying or publishing, or a name or number that picks which account, environment or thing gets changed, where a mishearing would change what happens.

- Cheap to undo (a stack pick, a doc, a draft, a name in a plan)? Take the likely reading and go on.
- Risky, and your reading is a guess? Confirm before the step, in one line, with your reading: `I read "10 stack start" as TanStack Start, right?` Ask nothing else, then do what they confirm. A glossary line makes a reading likelier, not certain: still confirm.
  - **Below Full:** wait for the answer.
  - **On Full:** don't wait. Take the likely reading, say it in one line as you go, record it as an AI pick, not reviewed, and go on.

## Handoffs stay word for word

Quote the person's exact words, as `ask` says. When your reading differs, put it beside them: `Owner: "…10 stack start…" (read as: TanStack Start)`. The receiver sees both and can disagree.

## The glossary

`~/.onrails/glossary.toml` holds the person's confirmed mishearings, one `"heard" = "meant"` line each. It is personal: never in a repo. The kit's own names (onRails, TanStack, Clerk, Drizzle, shadcn, Wrangler) are built in.

1. Run `node .agents/skills/ask/scripts/voice.mjs` once per session. It prints the `input` setting and the glossary. Use each line as a hint about what a sound means, not as a blind find and replace.
2. Add a line only after the person confirms a reading: their yes to your one-line confirm, or their own correction. A pick on Full is not a confirmation. Run `node .agents/skills/ask/scripts/voice.mjs add "<heard>" "<meant>"`. Same words again? It updates the line.

**Done when** you ran the script this session, and every mishearing the person confirmed is a line in the glossary.
