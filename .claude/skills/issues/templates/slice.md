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

- **Slice:** <!-- name --> · **Role:** core / support
- **Pass:** 1 / 2 / 3

## Acceptance checks

<!-- Written before the build. Each one is concrete and checkable.
     auto  = becomes an automated test that CI runs on every pull request
     agent = needs judgement; a fresh agent checks it on the preview before merge -->
- [ ] `auto` 
- [ ] `auto` 
- [ ] `agent` <!-- the steps to click, and what you should see -->

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

<!-- Leave blank to use the routing table. Fill in only to override it. -->
**Override:** 

**Priority:** p0 / p1 / p2 / p3
**Skills:** `build`, <!-- up to two more, named exactly -->
**Recipes:** <!-- the default libraries this needs, by recipe name: form, table, charts, markdown, highlight, virtual, hotkeys, start, router, query. Leave blank if none -->
