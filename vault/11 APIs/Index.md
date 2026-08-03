---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - api
---

# API Endpoints

```dataview
TABLE method, path, summary
FROM "11 APIs"
WHERE file.name != "Index"
SORT path ASC
```

## Conventions

- **Always JSON.** An operator who cannot load something must be told it failed,
  not shown an empty panel that reads like "there was nothing here".
- **401 for an expired session**, never a silent fallback to demo data.
- **422 for a data-integrity refusal** — a missing relationship names the thing
  that is missing rather than returning a stack trace.
- **409 for a rule refusing** — the request was fine; the workspace is not in a
  state where the action is allowed.
- **Read endpoints never spend.** Reviewing a decision must not cost money.

## Full route list

`app/api/` — accounts, agents, approvals, businesses, capabilities, command,
etsy, islamic, media, missions, operations, providers, search, settings, state,
workspace, youtube.
