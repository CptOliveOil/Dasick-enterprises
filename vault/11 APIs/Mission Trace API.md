---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The mission graph edge by edge, with every referenced id checked against the database.
method: GET
path: /api/missions/[id]/trace
related:
  - [[Task Graph]]
  - [[Script Not Found In AI Planned Missions]]
  - [[Mission Engine]]
tags:
  - api
---

# Mission Trace API

```http
GET /api/missions/[id]/trace
```

The mission graph edge by edge, with every referenced id checked against the database.

## Authentication

Session cookie; `businesses.view`; the mission must be yours.

## Request

No body.

## Response

```json
{ "trace": {
    "mission": { "number": 3, "status": "running" },
    "edges": [ { "stepKey": "script", "capability": "youtube.script.write",
                 "inputs": [ … ], "outputs": [ { "key": "script_id", "resolves": true } ],
                 "approval": { "payload": [ … ] } } ],
    "scripts": [ { "id": "…", "version": 2, "versionsArchived": 2 } ],
    "dangling": [],
    "summary": "Every referenced record resolves. 1 script belongs to this mission."
} }
```

## Errors

Built to answer one question: is a record **missing**, **never written**, or was
the **id never valid**? Those three look identical from outside and have
completely different causes.

Read-only and free.

## Related

- [[Task Graph]]
- [[Script Not Found In AI Planned Missions]]
- [[Mission Engine]]
