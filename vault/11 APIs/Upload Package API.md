---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Everything that ships with a video, assembled from stored rows. `?format=markdown` downloads it.
method: GET
path: /api/youtube/videos/[id]/package
related:
  - [[Upload Package]]
  - [[Studio Review]]
  - [[Copyright Review]]
tags:
  - api
---

# Upload Package API

```http
GET /api/youtube/videos/[id]/package
```

Everything that ships with a video, assembled from stored rows. `?format=markdown` downloads it.

## Authentication

Session cookie; `businesses.view`.

## Request

`?format=markdown` for a single document; default is JSON.

## Response

```json
{ "package": {
    "video": { "title": "…", "status": "ready" },
    "mode": { "mode": "production", "warning": null },
    "blockers": [ "No thumbnail has been selected." ],
    "files": [ { "name": "video.mp4", "url": "…", "note": null } ],
    "sections": [ { "id": "description", "body": "…", "missing": null } ],
    "markdown": "# Upload package — …"
} }
```

## Errors

A section with no underlying record reports `missing` rather than being omitted — a licence report that is absent and one that is empty mean different things.

## Related

- [[Upload Package]]
- [[Studio Review]]
- [[Copyright Review]]
