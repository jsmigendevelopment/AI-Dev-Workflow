# Auto grill

The AI grills itself, then the person reviews everything in one sitting. The topics, their order, the floor and the log are the same as the full grill. Only who answers first changes.

## 1. Recommend a high-end run

The self-grill makes every early decision. Before it starts, recommend a stronger model and more effort, in one line, from the "Auto grill" table in `routing`. Ask under `ask_before_strongest` (routing's first rule). Can't switch models in this session? Say so once, carry on with the current model, and record it.

**Done when** "Provenance" in `grill-log.md` names the model and effort used, and whether that was the recommended one.

## 2. Ask the seed questions, and nothing else

These four only the person can answer. Ask them in one round, open, with no suggestion (taste, scope and money get the open question first):

1. What is it, in your words? (The pitch from `/idea` step 1 counts. Don't ask it twice.)
2. Who is it for?
3. What is the one core thing it must do?
4. Anything you never want in it?

Log each with the source "person's answer". Ask nothing else before the review. A gap you'd normally ask about becomes a pick with two alternatives. A vague core gets one follow-up: the core is never defaulted.

**Done when** all four are answered and logged.

## 3. Run the self-grill

Go through every product topic in `grill`, in order, and every item on the floor checklist in `features.md`. For each decision:

- three options with their trade-offs, your pick and a one-line reason;
- the seed answers rule options in or out. A profile or preset answer becomes the pick, and the reason says so;
- the picks it depends on, in the "Depends on" column;
- one row in the "Auto grill" table of `grill-log.md`, source "AI pick".

**Pick the one-way doors too.** They cost the most to undo, so they get a row now even though `stack` writes them up later:

- the data model: what's stored, and who owns it;
- auth and access: who signs in, and who sees what;
- hosting and the database;
- money and time handling;
- the module boundaries.

Each door's row also says what changing it later would cost. Check every pick against the seed answers, the floor and `docs/architecture.md`'s conventions (money in integer minor units with its currency, instants in UTC). A pick that breaks one is wrong: fix it, and say so at the review.

**Alongside, in the background:**

- the competitor scan (`research`): the MVP topic needs it;
- `wireframes` stage 1 for your picks, with two layouts of the core screen, A and B;
- a shortlist of names (`name` step 2), checked against the competitor scan.

Hold the screens and names for the review. Ask nothing about them before it: no per-screen "What would you change?" in auto mode.

**Done when** every topic and floor item has a row with three options, a pick and a reason; the five doors have rows; stage 1 is drawn with two core layouts; and the name shortlist is checked.

## 4. Show the review

Before you show the review, check every one-way door against the seed answers and the conventions again, even when you resume from a drafted log. Fix a door that breaks one, and flag the fix in its block.

One message, three groups, in this order. Every row from step 3 lands in exactly one group.

1. **One-way doors.** Numbered, one block each: the door in plain words, your pick, the two alternatives, the reason, and the cost of changing it later. Flag any pick you fixed in step 3. End each block with its own question: *"Confirm, or which one?"* "Looks good" never confirms a door. Each one needs its own yes.
2. **Look and feel.** Wireframe layouts A and B side by side (the prototype's `#ids`), the feel, theme, density and voice picks, and the name shortlist with your pick.
3. **Everything else, in one table:** Topic · Pick · Alternatives · Reason. Then: *"Change any row in plain words. 'Looks good' accepts the rest."*

**Done when** the person has answered every door on its own and replied on the table.

## 5. Re-check what a change touches

When the person changes a pick, re-check every pick that depends on it (the "Depends on" column, and anything else it breaks). Redo the ones that no longer fit. Show what moved in a table: Topic · Was · Now · Why. A door that moved needs its own yes again.

**Done when** every pick that depends on a changed one was re-checked, and the "What moved" table is shown.

## 6. Record it

- Set each row's source in `grill-log.md`: "AI pick, approved at review", "changed at review" or "person's answer".
- Write each decision to `decisions.md`, origin "AI pick, approved at review", "changed at review" or "person".
- Tick the coverage map. Write "Look and feel" in `design.md`.
- Then go back to `/idea`. The name is picked, so `name` starts at its step 3. Stage 2 of `wireframes` draws the picked layout with the agreed look. The wireframe approval gate (`/idea` step 6) still holds.

**Done when** every row in the log has a source, and every door has its own confirmation in `decisions.md`.
