---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A system mission scheduled business-scoped work with no business behind it
severity: high
commit: 4da2289
resolved: 2026-08
related:
  - [[Capability Scope]]
  - [[Operational Readiness]]
  - [[Mission Engine]]
tags:
  - bug
---

# Operational Readiness Fans Out Instead Of Guessing A Business

> [!bug] Problem
> Operational Readiness is a system-level mission: it checks whether the
> whole workspace is ready to operate, not any one business. Checking that
> means running business-scoped capabilities — but the Manager had no concept
> of *scope*, so it planned those capabilities straight onto the system
> mission, which has no business. The failure that surfaced was correct: the
> capability's own `businessIdFor()` refused it. The bug was everything
> upstream of that refusal having no way to do the right thing instead.

## Symptoms

A business-scoped capability, planned onto a mission with `business_id: null`,
throws `MissingRelationship` (`lib/db/validate.ts`) from deep inside its own
`persist()` — three layers from anything that could have prevented it, and
indistinguishable from an ordinary bug in that capability.

## Root cause

Nothing between "the operator asked for a system-wide check" and "a task ran
a business capability" ever asked what that capability needed. `createMission`
accepted any combination of `businessId` and capabilities without checking
whether they were compatible; the Manager's local router and AI planner both
assumed one mission, one (possibly absent) business, for every kind of
instruction. A genuinely cross-business instruction had no representation —
the planner could only try to force it into the same one-mission shape as
everything else, guess a business, or fail unrecognisably.

## Investigation

Confirmed `businessIdFor()` (`lib/agents/capabilities.ts`) was the only thing
in the path that actually understood "this needs a business" — and it found
out at the worst possible time, after a mission and its tasks already
existed. Traced every capability that calls it (ten, all in
`lib/agents/capabilities.ts`) to build an evidence-based list rather than
guessing. Tried defaulting every *unclassified* capability to `business` as
the "safe" direction first — it broke a passing test, because
`pokemon.etsy.opportunities` deliberately tolerates a missing business (see
`baseRow()`, `lib/agents/pokemon/research.ts`) and always has. The safe
default had to be evidence, not caution.

## Fix

Three things, matching the three numbered requirements this bug came with:

1. **`lib/agents/scope.ts`** — `capabilityScope()`, classifying every
   capability as `system`, `business` or `mission`. See
   [[Capability Scope]] for the full reasoning.
2. **`createMission()`** (`lib/workflows/engine.ts`) now refuses to create
   *any* mission that plans a `business`-scoped step with no business —
   `ScopeViolation`, thrown before a row is written. `handleCommand()`
   (`lib/agents/manager.ts`) runs the same check earlier still, so an
   ambiguous instruction gets a plain-language reply instead of a thrown
   error reaching the caller.
3. **`lib/workflows/readiness.ts`**, `startOperationalReadiness()` — the fan-out.
   A parent mission with no business and no tasks of its own
   (`allowNoSteps: true`), one child mission per configured business
   (`parent_mission_id` set, real `business_id`, fully isolated), plus one
   system-scoped child for shared infrastructure. `recomputeMission()`
   (`lib/workflows/engine.ts`) derives the parent's status from its children
   (`deriveParentMissionState`) and, once every child has finished, dynamically
   imports `finalizeReadinessReport()` to build one report and post it as the
   Commander's reply — the same dynamic-import pattern
   `lib/workflows/approvals.ts` already uses to reach `lib/islamic/resolve.ts`
   without a static import cycle.

Never filters to "the first business," never invents one when none are
configured — `startOperationalReadiness` iterates every business the owner
actually has, and the infrastructure child runs regardless of how many that
is, including zero.

## Tests added

`tests/readiness.test.ts` — ten tests, in four groups matching the four
regression requirements: system missions cannot write into a business
(`createMission` refuses; `handleCommand` replies instead of throwing; an
explicit orchestrator mission with zero tasks is still permitted), business
missions always have a business context (fan-out gives each business its own
child, never null, never shared; zero businesses means zero business
children, not an invented one), aggregated readiness (one report naming every
area; a failed child fails the parent without hiding which one), and retries
preserve isolation (a retried child's task stays scoped to its own business;
a sibling business's task is byte-for-byte unaffected; the aggregated report
still attributes findings to the right business after the retry).

## Commit

`4da2289`

## Lessons learned

**A validation deep in the stack being correct does not mean the system
around it is.** `businessIdFor()` was never wrong. The bug was that its
refusal was the *first* place anything checked — everything upstream had
already committed to a plan that could not work. Fixing it meant moving the
question earlier, to where an actual choice (ask, or fan out) was still
possible, not weakening the answer at the bottom.

**"Default to the safe option" needs evidence of what safe actually is.**
The instinct to default unclassified capabilities to the strict scope felt
cautious and was measurably wrong — it blocked code that had never failed.
The correct default came from reading which capabilities actually throw, not
from assuming the stricter reading is always the conservative one.

## Related

- [[Capability Scope]]
- [[Operational Readiness]]
- [[Mission Engine]]
