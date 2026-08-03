---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Derived step keys were neither unique nor predictable
severity: critical
commit: 46dc67e
resolved: 2026-08
related:
  - [[Task Graph]]
  - [[Manager]]
  - [[Script Not Found In AI Planned Missions]]
tags:
  - bug
---

# Step Key Collision

> [!bug] Problem
> AI-planned missions could not find their own outputs. `previousOutputs.script` was always undefined.

## Symptoms

The revision step failed in every Manager-planned mission, and never in a workflow-defined one.

## Root cause

Two lines, two files:

```ts
const stepKey = step.key ?? step.capability.split('.').pop();  // engine.ts
const fromStep = ctx.previousOutputs.script?.script_id;         // capabilities.ts
```

A workflow definition sets `key: 'script'` by hand. A Manager plan sets no key,
so the script step was keyed `write`. **Nothing was keyed `script`.**

The derivation was also not unique: `youtube.voiceover.generate` and
`youtube.thumbnail.generate` both reduce to `generate`, silently discarding one
step's output.

## Investigation

The task title `Finalize script with fact-check corrections` used American
spelling; the codebase is British throughout. That meant the mission was
Manager-planned, not workflow-defined — which is why every test passed.

## Fix

`assignStepKeys` derives from the whole capability and de-duplicates within a
mission. `loadPreviousOutputs` orders by completion time so later work wins
deterministically. The resolver takes the **newest** script when several steps
name one.

## Tests added

`tests/executor-state.test.ts` — plans a mission the way the Manager does and walks the full sequence. Reverting either line fails it.

## Commit

`46dc67e`

## Lessons learned

**Every test built missions the same way.** The bug lived in the path no test
exercised. A fixture that only ever takes the well-formed route tests the route,
not the system.

**A spelling difference was the diagnostic.** Small inconsistencies carry
information about provenance.

## Related

- [[Task Graph]]
- [[Manager]]
- [[Script Not Found In AI Planned Missions]]
