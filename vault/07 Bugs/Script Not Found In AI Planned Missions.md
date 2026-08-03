---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The script existed; nothing could find it
severity: critical
commit: 305be17
resolved: 2026-08
related:
  - [[youtube_scripts]]
  - [[Step Key Collision]]
  - [[Fail Loudly Never Silently]]
  - [[Mission Trace API]]
tags:
  - bug
---

# Script Not Found In AI Planned Missions

> [!bug] Problem
> A revision step failed with `No script was supplied to revise`, while the approval screen said the original records were gone.

## Symptoms

Both statements appeared true simultaneously. The mission looped on the revision step.

## Root cause

**Nothing deletes scripts.** There is no `remove` call against `youtube_scripts`
anywhere; RLS uses the same expression for `using` and `with check`; retry only
touches failed steps.

Every step resolved the script for itself, and each failed differently and
silently:

| Step | On a miss | Consequence |
| --- | --- | --- |
| Fact check | substituted `(script unavailable)` | produced a real approval for a script it never read |
| Revise | threw one message | covered two unrelated faults |
| Approval review | fell back to the payload | told the operator the records were gone |

## Investigation

Eliminated deletion, RLS and retry in turn. The decisive evidence was that the
approval could read the script by **id from its payload** while the revision
could not find it by **step key** — same row, two lookups, one broken.

## Fix

`lib/workflows/script-resolution.ts` — the only code allowed to answer "which
script is this mission working on?". It tries, in order: task input → any earlier
step output → the id inside the approval → the mission's own tasks joined to
`youtube_scripts.task_id`. Ids are uuid-validated first.

Where a head row is missing it is **rebuilt from `youtube_script_versions`** and
written back. Where nothing resolves, the error names every source tried.

## Tests added

`tests/script-resolution.test.ts` — 17 tests including archive rebuild and a full end-to-end recovery.

## Commit

`305be17`

## Lessons learned

**A symptom two steps downstream points at the wrong thing.** The visible
failure was in revision; the fault was in the fact checker tolerating a missing
script.

**Silent degradation is worse than failure.** Three consumers, three behaviours,
none of them saying what had gone wrong.

## Related

- [[youtube_scripts]]
- [[Step Key Collision]]
- [[Fail Loudly Never Silently]]
- [[Mission Trace API]]
