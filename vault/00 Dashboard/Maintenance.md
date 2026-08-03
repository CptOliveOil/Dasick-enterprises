---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Keeping the vault true for years
related:
  - [[Vault Conventions]]
  - [[Claude Workflow]]
tags:
  - meta
  - dashboard
---

# Maintenance

## The failure mode to avoid

A vault becomes useless in exactly one way: it stops being true, people notice,
and they stop reading it. Everything below exists to prevent that.

## Weekly — 10 minutes

- [ ] Anything `draft`, `needs-review` or `stale` on [[Home]]: fix or delete
- [ ] [[Blockers]] matches reality
- [ ] New commits reflected in [[Important Commits]]

## Monthly — 30 minutes

- [ ] Graph view: fix orphans and clusters that should link
- [ ] Every page in `01 Architecture` still describes the code
- [ ] [[Backlog]] reordered by real value
- [ ] Provider costs still accurate

## Quarterly

- [ ] Re-read [[08 Decisions/Index|Decisions]]. Mark anything overtaken as `superseded` — **do not delete it**
- [ ] Re-read [[07 Bugs/Index|Bugs]] patterns. Are the same categories recurring?
- [ ] Prune [[10 Research/Index|Research]] beliefs the data has contradicted
- [ ] Update [[Long Term Vision]] if the shape has changed

## Drift detection

```dataview
TABLE updated, status
FROM "01 Architecture" OR "04 Providers" OR "06 Workflows"
WHERE updated < date(today) - dur(90 days)
SORT updated ASC
```

Anything above has not been touched in three months. That is not automatically
wrong — but it is worth a glance.

## Deleting

Delete freely: superseded drafts, duplicate notes, contradicted beliefs.

Never delete: bug pages, decision records (mark `superseded`), migration history.
