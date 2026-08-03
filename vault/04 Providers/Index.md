---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - provider
---

# Providers

```dataview
TABLE status, interface, summary
FROM "04 Providers"
WHERE file.name != "Index"
SORT status ASC, file.name ASC
```

## The nine interfaces

| Interface | Real adapter | Simulated | Unconnected |
| --- | --- | --- | --- |
| `VoiceProvider` | [[ElevenLabs]] | ✅ | ✅ |
| `MusicProvider` | — | ✅ | ✅ |
| `ImageProvider` | [[OpenAI]] | ✅ | ✅ |
| `VideoProvider` | — | ✅ | ✅ |
| `StockMediaProvider` | [[Openverse]] | ✅ | ✅ |
| `SubtitleProvider` | — | ✅ | ✅ |
| `VideoRenderer` | [[FFmpeg]] | n/a (local) | ✅ |
| `Publisher` | [[YouTube API]] | ✅ | ✅ |
| `AnalyticsProvider` | [[YouTube API]] | ✅ | ✅ |

## Adding one

```ts
// lib/integrations/providers/mine.ts
export class MyVoiceProvider implements VoiceProvider { … }

// registry.ts — one line
if (realProvidersAllowed() && myProviderConfigured()) return new MyVoiceProvider();
```

No workflow change. No capability change. No engine change. See
[[Provider Layer]] and [[One Interface Per Capability Kind]].

> [!warning] The ordering that matters
> `realProvidersAllowed()` is checked **before** the credentials. Checking
> credentials first would bill someone for running the demo.
