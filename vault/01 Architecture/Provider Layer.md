---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Nine interfaces; the mode decides which implementation answers
related:
  - [[Mode System]]
  - [[04 Providers/Index|Providers]]
  - [[Media Pipeline]]
  - [[Rendering Pipeline]]
tags:
  - architecture
---

# Provider Layer

> [!info] Purpose
> Every external service is reached through an interface. The workflow never names a vendor, and swapping a provider is one line in the registry.

**Code** — `lib/integrations/providers/*`

## Responsibilities

- Define the nine interfaces: Voice, Music, Image, Video, Stock, Subtitles, Renderer, Publisher, Analytics
- Resolve each to a real, simulated or unconnected implementation by [[Mode System|mode]]
- Refuse rather than substitute when nothing is connected

## Inputs

- Environment configuration and the current mode

## Outputs

- A provider instance, plus a descriptor for the settings page (never a key)

## Dependencies

- [[Mode System]] decides
- [[Agent Engine]] calls

## Failure modes

- **Credentials set but no adapter** → explicit error, never silent success.
- **Unconnected provider** → throws; the step blocks with the variables required.
- **Demo Mode with real keys** → still simulated. Checking credentials first would bill someone for running the demo.

## Future improvements

- Adapters for video clips and music
- Per-business provider overrides

## Related

- [[Mode System]]
- [[04 Providers/Index|Providers]]
- [[Media Pipeline]]
- [[Rendering Pipeline]]
