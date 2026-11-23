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

<!-- Written BEFORE the build. Each check is something another agent can run or click. -->
- [ ] 
- [ ] 
- [ ] Browser: <!-- the steps to click, and what you should see -->

## Out of scope

<!-- The fence. Nearby things this issue must NOT do. -->
- 

## Dependencies

- **Depends on:** #
- **Blocks:** #

## Touches

- **Modules:** <!-- e.g. features/lists, features/auth -->
- **Decoupled:** yes / no <!-- if no, list the issues it may conflict with -->
- **Schema or migration change:** yes / no
- **API contract change:** yes / no

## Routing

| Role | Model | Effort |
|---|---|---|
| Builder |  |  |
| Code reviewer |  |  |
| Security reviewer |  |  |

**Priority:** p0 / p1 / p2 / p3
**Skills:** `build-issue`, <!-- up to two more, named exactly -->

## Human gate

<!-- none / read schema / skim API / approve merge (follow the risk dial in docs/stack.md) -->
