---
status: implemented
created: 2026-08-03
updated: 2026-08-03
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
> **implemented** — implements `Publisher, AnalyticsProvider`

## Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **YouTube Data API v3** and **YouTube Analytics API**
3. Create OAuth credentials (Desktop or Web)
4. Complete the consent flow once with scopes `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`
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

## Related

- [[Publisher]]
- [[Analytics]]
- [[Google OAuth]]
- [[Security]]
