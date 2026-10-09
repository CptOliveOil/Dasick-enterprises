---
status: implemented
created: 2026-08-03
updated: 2026-10-09
owner: fayaz
summary: Publishing and analytics
interface: Publisher, AnalyticsProvider
related:
  - [[Publisher]]
  - [[Analytics]]
  - [[Google OAuth]]
  - [[Security]]
tags:
  - provider
---

# YouTube API

> [!info] Implementation status
> **implemented, never run against the real API** — implements `Publisher, AnalyticsProvider`.
> As of 2026-10-09: CODE EXISTS · UNIT TESTED (with a recording publisher).
> Not REAL SERVICE VERIFIED — no credentials have ever been configured.

## Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **YouTube Data API v3** and **YouTube Analytics API**
3. Create OAuth credentials (Desktop or Web)
4. Complete the consent flow once with scopes `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`
   **and `youtube.force-ssl`** — `captions.insert` requires it. Without it the
   caption upload fails and, by design, does not fail the upload, so the video
   silently goes up without captions.
5. Store the refresh token server-side

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `YOUTUBE_CLIENT_ID` | yes | |
| `YOUTUBE_CLIENT_SECRET` | yes | |
| `YOUTUBE_REFRESH_TOKEN` | yes | Obtained once via OAuth |
| `YOUTUBE_CATEGORY_ID` | no | Defaults to 27 (Education) |

## Costs

Free, but quota-limited.

## Limits

Daily quota of 10,000 units; an upload costs about 1,600. Roughly six uploads a day.

## Authentication

OAuth refresh token exchanged for a short-lived access token, cached just under its lifetime so a long upload cannot expire mid-transfer. **Never browser automation.**

## Failure modes

- **Upload fails** → never retried automatically. A retried upload is a duplicate video.
- **Thumbnail or caption upload fails** → does not orphan a successful upload; the video exists and the package carries the rest.
- **Scheduled with no publish time** → refused.
- Default privacy is **private**.
- **The upload needs its own approval** — a `publish` approval raised by the
  `publish` step after final approval, once the publisher is connected and the
  file is on disk. Skipped only if the channel enabled auto-publish. See
  [[Final Approval Ran The Upload Step Unasked]].
- **File path** → the adapter reads the absolute path it is given; the step
  resolves it with `assetLocalPath` (downloading from Supabase Storage first if
  needed). Before 2026-10-09 it passed the storage key and every real upload
  would have failed with ENOENT.

## Known risks (unverified)

- **Single multipart request, whole file in memory.** Google recommends
  resumable uploads for large files; a 10-minute 1080p render is 100MB+. If the
  first real upload fails on size, switch to `uploadType=resumable`.
- **Unverified Google Cloud project** → YouTube locks API uploads private until
  the project passes an audit. Harmless here (uploads are private), but
  `public`/`scheduled` would not take effect.
- Thumbnail upload always sends `image/png`.

## Related

- [[Publisher]]
- [[Analytics]]
- [[Google OAuth]]
- [[Security]]
