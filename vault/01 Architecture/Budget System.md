---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Ceilings the workforce cannot raise
related:
  - [[Agent Engine]]
  - [[Authority Model]]
  - [[ai_budgets]]
  - [[Budgets Have No Default]]
tags:
  - core
  - architecture
---

# Budget System

> [!info] Purpose
> No default budget exists. Nothing spends until the operator sets a figure, and no agent can raise it — the table is owner-only at the database level.

**Code** — `lib/finance/ai-budget.ts`

## Responsibilities

- Monthly ceiling (hard stop), per-mission ceiling, approval threshold
- Month-to-date and per-mission spend from `api_usage`
- Estimate before spending; price unknown models as the dearest

## Inputs

- An estimate, a mission id, the current time

## Outputs

- A decision: allowed, requires approval, exceeds ceiling, or not activated

## Dependencies

- [[Agent Engine]] checks before every live call
- [[ai_budgets]] stores the ceilings

## Failure modes

- **No budget set** → nothing runs, with an explanation. Deliberate: a limit you did not choose is not a limit.
- **Unknown model** → priced as the most expensive. Guessing low is how a ceiling gets passed.

## Future improvements

- Per-business budgets
- Forecasting from [[Business Memory]]

## Related

- [[Agent Engine]]
- [[Authority Model]]
- [[ai_budgets]]
- [[Budgets Have No Default]]
