---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Everything an operator needs in order to decide, for any approval kind.
method: GET
path: /api/approvals/[id]/dossier
related:
  - [[Approval Dossier]]
  - [[Approval System]]
  - [[Studio Review]]
tags:
  - api
---

# Approval Dossier API

```http
GET /api/approvals/[id]/dossier
```

Everything an operator needs in order to decide, for any approval kind.

## Authentication

Session cookie; `businesses.view` permission; the approval must belong to the caller.

## Request

No body.

## Response

```json
{ "dossier": {
    "approval": { "id": "…", "kind": "script", "status": "pending" },
    "summary": { "title": "…", "metrics": [ … ], "notice": null },
    "panels": [ { "kind": "document", "id": "script", "blocks": [ … ] } ],
    "actions": { "approve": { "consequence": "…" }, "requestChanges": { "presets": [ … ] } },
    "document": { "title": "…", "markdown": "…" },
    "source": "records"
} }
```

## Errors

| Code | Meaning |
| --- | --- |
| 401 | Session expired — never demo data |
| 403 | Permission refused |
| 404 | No such approval, or not yours |
| 500 | Could not assemble; the body says so rather than returning an empty panel |

Read-only. **No provider is called and nothing is regenerated** — reviewing must
never cost money.

## Related

- [[Approval Dossier]]
- [[Approval System]]
- [[Studio Review]]
