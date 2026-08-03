---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Demo and Production execute an identical task graph
adr: 2
decided: 2026-07
related:
  - [[Mode System]]
  - [[Workflow Engine]]
  - [[Faceless YouTube Video]]
tags:
  - decision
  - adr
---

# ADR-002 — One Workflow Not Two

> [!success] Decision
> There is one workflow definition per job. The mode decides only which provider implementation answers each call.

**Status** — accepted

## Reason

The alternative is what most systems end up with: a demo pipeline that works
and a real pipeline that does not, diverging quietly until the demo is a lie.

## Alternatives considered

- **A `demo_` variant of each workflow** — rejected; guarantees drift.
- **A feature flag inside each step** — rejected; the branch would spread.

## Trade-offs

Demo Mode has to produce structurally real artifacts, which is more work than returning stubs.

## Consequences

`tests/modes.test.ts` asserts the two graphs are `toEqual` identical and that no definition names a vendor.

## Related

- [[Mode System]]
- [[Workflow Engine]]
- [[Faceless YouTube Video]]
