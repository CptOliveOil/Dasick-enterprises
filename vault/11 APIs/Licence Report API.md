---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Where every picture came from, with the disclaimer in the document itself.
method: GET
path: /api/youtube/videos/[id]/licence
related:
  - [[Copyright Review]]
  - [[Never Claim Legal Safety]]
  - [[Studio Review]]
tags:
  - api
---

# Licence Report API

```http
GET /api/youtube/videos/[id]/licence
```

Where every picture came from, with the disclaimer in the document itself.

## Authentication

Session cookie; `businesses.view`; ownership verified through the business.

## Request

`?format=markdown` to download.

## Response

```json
{ "report": {
    "records": [ { "assetId": "…", "provenance": "licensed_stock",
                   "creator": "…", "licence": "by-sa", "scenes": [3, 7],
                   "reason": "Licensed under by-sa by …" } ],
    "blocking": [], "manualReview": [ … ], "attributions": [ "…" ],
    "disclaimer": "This report records what Command Centre stored … It is not legal advice …"
} }
```

## Errors

Carries no provider credentials. See [[Secrets Never Leave The Server]].

## Related

- [[Copyright Review]]
- [[Never Claim Legal Safety]]
- [[Studio Review]]
