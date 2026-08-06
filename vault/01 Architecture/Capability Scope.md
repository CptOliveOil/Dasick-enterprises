---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What a capability needs before it can run — system, business or mission
related:
  - [[Capability Registry]]
  - [[Mission Engine]]
  - [[Manager]]
tags:
  - architecture
---

# Capability Scope

> [!info] Purpose
> Before the Manager commits to a plan, it must know what each capability in
> it needs — a whole workspace, one business, or state a prior step in the
> same mission already produced. Getting this wrong is what
> [[Operational Readiness Fans Out Instead Of Guessing A Business|the bug this fixes]]
> was.

**Code** — `lib/agents/scope.ts`

## The three scopes

- **`system`** — operates over the whole workspace. Never given a business,
  never needs one. `manager.briefing`, `manager.recommendations`,
  `system.readiness.audit`.
- **`business`** — fails outright with no business behind it. A hand-kept
  allowlist (`BUSINESS_CAPABILITIES`), built by finding every capability whose
  `persist()`/`run()` calls `businessIdFor()` (`lib/agents/capabilities.ts`) or
  otherwise refuses without one (`business.readiness.check`). Genuinely
  dangerous to get wrong in either direction: too narrow and a capability
  fails deep inside its own `persist()` with `MissingRelationship`
  (`lib/db/validate.ts`); too broad and it blocks routes that have never
  actually failed.
- **`mission`** — the default for everything else. Two different reasons land
  here, on purpose: genuinely business-agnostic research (most of the Pokémon
  and Islamic handlers, which write `business_id: null` deliberately rather
  than throwing), and capabilities that depend on state a *prior step in the
  same mission* already produced — `youtube.script.revise` needs the script it
  is revising, `etsy.package.zip` needs the listing and artwork a mission
  built earlier. Neither kind should ever be scheduled as a mission's first,
  standalone step with nothing behind it.

## Why the default is permissive, not strict

The obvious "safe" design looks the other way round: default every
unclassified capability to `business`, so a forgotten classification fails
loudly. That was tried first, and broke a passing test —
`pokemon.etsy.opportunities` writes `business_id: null` on purpose (see
`baseRow()` in `lib/agents/pokemon/research.ts`) and has never required a
business. Defaulting to `business` would have blocked a route that has never
actually failed, which is not "safe," it is wrong in the other direction.
The correct default had to come from evidence — grepping for
`businessIdFor(` call sites — not from what felt cautious.

## Used by

- **`lib/workflows/engine.ts`**, `createMission()` — refuses to create *any*
  mission (not just a readiness one) that plans a `business`-scoped step with
  no business, via `businessCapabilitiesWithoutBusiness()`. This is the
  planner-level fix: the same check `businessIdFor()` makes, run before a
  single row is written instead of three layers into a running task.
- **`lib/agents/manager.ts`**, `handleCommand()` — the same check, run again
  before `createMission` is even called, so an ambiguous instruction ("keyword
  research" with no business named) gets a plain-language reply instead of a
  thrown `ScopeViolation` reaching the caller. Belt and suspenders, the same
  shape as [[Fix The Producer Not The Boundary]].
- **[[Operational Readiness]]** — the reason this exists at all. A `system`
  mission that needs `business`-scoped work fans out into one child mission
  per business instead of trying to run business capabilities with no
  business behind them.

## Failure modes

- **A new capability calls `businessIdFor()` and is never added to
  `BUSINESS_CAPABILITIES`** → it keeps failing the old way, deep in its own
  `persist()`, invisible to the planner. This file's one maintenance
  obligation; there is no automatic check for it.

## Future improvements

- A test that greps every handler file for `businessIdFor(` calls and asserts
  the capability is listed here, so the maintenance obligation above is
  enforced rather than merely documented.

## Related

- [[Capability Registry]]
- [[Mission Engine]]
- [[Manager]]
