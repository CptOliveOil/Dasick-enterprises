---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A placeholder must be unmistakable
adr: 3
decided: 2026-07
related:
  - [[Mode System]]
  - [[Business Memory]]
  - [[Never Invent Metrics]]
tags:
  - decision
  - adr
---

# ADR-003 — Simulated Providers Must Never Be Silent

> [!success] Decision
> Simulated providers produce structurally real output — a playable file, correctly
timed cues — and mark themselves unmistakably. Two go further: the simulated
publisher returns an id shaped `simulated-…` and never writes
`published_external_id`, and the simulated analytics provider returns **nothing
at all**.

**Status** — accepted

## Reason

Structure must be real or the demo tests nothing. Content must be fake or the
demo is a lie. Analytics is the sharp case: every other simulated provider
fabricates structure, but analytics would have to fabricate *results*, and those
flow into [[Business Memory]] and from there into every future prompt.

## Alternatives considered

- **Plausible fake analytics** — rejected; it teaches the workspace's own agents that imaginary videos performed well.
- **Throwing in Demo Mode** — rejected; the demo must complete.

## Trade-offs

A demo shows empty analytics, which looks like a gap until you know why.

## Consequences

Nothing produced in a demo can be mistaken for real work by any later step.

## Related

- [[Mode System]]
- [[Business Memory]]
- [[Never Invent Metrics]]
