---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Nine provider interfaces, not one generic one
adr: 13
decided: 2026-08
related:
  - [[Provider Layer]]
  - [[04 Providers/Index|Providers]]
tags:
  - decision
  - adr
---

# ADR-013 — One Interface Per Capability Kind

> [!success] Decision
> Voice, Music, Image, Video, Stock, Subtitles, Renderer, Publisher and Analytics are separate interfaces.

**Status** — accepted

## Reason

A single generic `Provider` interface would have every method optional, and every call site would guard. The interfaces are the documentation of what a kind must do.

## Alternatives considered

- **One generic interface** — rejected; type safety collapses.
- **An interface per vendor** — rejected; that is the coupling this design exists to prevent.

## Trade-offs

Nine interfaces to maintain, and three implementations each.

## Consequences

Adding a vendor is one class and one registry line. `tests/modes.test.ts` asserts no workflow names a vendor.

## Related

- [[Provider Layer]]
- [[04 Providers/Index|Providers]]
