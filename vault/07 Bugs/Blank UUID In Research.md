---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: An empty string reached a uuid column
severity: high
commit: 9259d84
resolved: 2026-07
related:
  - [[Database]]
  - [[youtube_research]]
  - [[Fix The Producer Not The Boundary]]
tags:
  - bug
---

# Blank UUID In Research

> [!bug] Problem
> A real full-video mission failed at the research step with `youtube_research: invalid input syntax for type uuid: ""`.

## Symptoms

The mission stopped at step one. Postgres rejected the insert; the message named the column but not the cause.

## Root cause

A **type/schema disagreement**. `YoutubeResearch.idea_id` was non-nullable in
TypeScript but nullable in SQL, so handlers wrote `?? ''` to satisfy the type —
and an empty string is not a uuid.

## Investigation

Traced from the failing insert back to the producer rather than patching the
insert. The same `?? ''` pattern appeared in several handlers, which meant the
type was wrong, not the call site.

## Fix

- `lib/db/validate.ts`: `optionalId()` → uuid or null; `requireId()` → uuid or a
  named `MissingRelationship`; `assertStorableRow()` at **both** stores
- Types corrected to `UUID | null` where SQL already allowed null
- Every `?? ''` replaced
- A `retry_mission` action so a failed mission resumes without re-paying

## Tests added

`tests/uuid-integrity.test.ts` — 16 tests, including an end-to-end sweep asserting every id column is a uuid or null.

## Commit

`9259d84`

## Lessons learned

**Fix the producer, not the boundary.** Patching the database to accept empty
strings would have hidden six more latent instances the boundary guard then
found.

**A type that disagrees with its schema will be worked around.** The `?? ''` was
a symptom of the disagreement, not carelessness.

## Related

- [[Database]]
- [[youtube_research]]
- [[Fix The Producer Not The Boundary]]
