---
name: Slice
about: One vertical slice (or sub-slice) that an agent can build alone
title: "[pass N] <slice>: <what a user can do after this>"
---

## Goal

<!-- One or two sentences. What a user can do once this is merged. -->

## Why

<!-- Link the vision, MVP or feedback this comes from. -->

## Pyramid

- **Slice:** <!-- name --> · **Role:** core / support / insisted
- **Pass:** 1 / 2 / 3

## Acceptance checks

<!-- Written before the build. One result each. The test that proves it has the ID in its title.
     auto  = becomes an automated test that CI runs on every pull request
     agent = needs judgement; a fresh agent checks it on the preview before merge
     Unsure? Write [NEEDS CLARIFICATION: <question>]. The issue can't be status:ready until it's answered. -->
- [ ] `auto` AC-<issue>-1: WHEN  THEN 
- [ ] `auto` AC-<issue>-2: WHEN  THEN 
- [ ] `agent` AC-<issue>-3: WHEN  THEN  <!-- the steps to click, and what you should see -->

## Out of scope

<!-- The fence. Nearby things this issue must not do. -->
- 

## Dependencies

- **Depends on:** #
- **Blocks:** #

## Touches

- **Modules:** <!-- e.g. features/lists, features/auth -->
- **Decoupled:** yes / no <!-- if no, list the issues it may conflict with -->

## Risk flags

<!-- Tick any that apply. One tick puts the issue in the risky lane: security review plus the human gate. -->
- [ ] Auth or permissions
- [ ] Secrets or config
- [ ] Personal data
- [ ] Money
- [ ] Schema or migration
- [ ] New dependency
- [ ] API contract change

**Lane:** tiny / normal / risky

## Routing

**Complexity:** <!-- 1–10 · one-line reason. Above 7: split it. The scale is in the issues skill. -->
**Override:** <!-- Leave blank to use the routing table. -->

**Priority:** p0 / p1 / p2 / p3
**Skills:** `build`, <!-- up to two more, named exactly -->
**Recipes:** <!-- the default libraries this needs, by recipe name: form, table, charts, markdown, highlight, virtual, hotkeys, start, router, query. Leave blank if none -->
