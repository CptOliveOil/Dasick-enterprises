---
status: living
created: 2026-08-03
updated: 2026-08-16
owner: fayaz
related:
tags:
  - index
  - bug
---

# Bugs

> [!important] Never delete a bug page
> The fix is the least valuable part. The pattern is what stops the next one.

```dataview
TABLE severity, resolved, commit, summary
FROM "07 Bugs"
WHERE file.name != "Index"
SORT resolved DESC
```

## Patterns that keep recurring

| Pattern | Seen in |
| --- | --- |
| One message covering several unrelated faults | [[Structured Output Validation Failure]], [[Script Not Found In AI Planned Missions]] |
| Silent degradation instead of failure | [[Script Not Found In AI Planned Missions]], [[Simulated Provider Name Mismatch]] |
| A guard that never fires | [[Simulated Provider Name Mismatch]], [[Demo Mode Would Have Spent Money]] |
| Tests only exercising the well-formed path | [[Step Key Collision]] |
| A type disagreeing with its schema | [[Blank UUID In Research]] |
| Symptom appearing steps away from the cause | [[Script Not Found In AI Planned Missions]], [[Zoompan Frame Explosion]] |
| A narrow field's meaning assumed to answer a broader question | [[Approving A Video Was Permanently Disabled Outside Supabase Storage]] |
| Advisory UI text mistaken for enforcement | [[Approving A Video Was Permanently Disabled Outside Supabase Storage]] |
| A decision changing what's true, without revisiting everything that assumed the old truth | [[Workflow Runs Referenced A Workflow That Was Never A Database Row]] |
| A test double invisible to the one constraint that mattered | [[Workflow Runs Referenced A Workflow That Was Never A Database Row]] |
| A graceful-looking failure at creation time that nothing downstream ever reads | [[A Missing Agent Left A Readiness Task Queued Forever]] |
| Two meaningfully different states sharing one status label | [[A Missing Agent Left A Readiness Task Queued Forever]] |
| Idempotent provisioning with no path to backfill growth | [[A Missing Agent Left A Readiness Task Queued Forever]] |
