---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Keys are absent from errors, descriptors and reports
adr: 12
decided: 2026-08
related:
  - [[Security]]
  - [[Provider Layer]]
  - [[04 Providers/Index|Providers]]
tags:
  - decision
  - adr
---

# ADR-012 — Secrets Never Leave The Server

> [!success] Decision
> Provider keys are read inside adapters, sent as headers rather than in URLs,
scrubbed from every error by `redact()`, and never included in a descriptor sent
to the browser or in a downloadable report.

**Status** — accepted

## Reason

Provider errors are written to `task.error`, shown on screen and logged. Without active scrubbing a key ends up in the database.

## Alternatives considered

- **Trusting providers not to echo credentials** — rejected; several do.
- **Redacting only at the log** — insufficient; the error is stored as well as logged.

## Trade-offs

`redact()` is deliberately blunt and can over-redact a message. A few lost characters is the right trade against a leaked key.

## Consequences

Descriptors name the *variables* required, never their values. A test asserts a key never survives an error path.

## Related

- [[Security]]
- [[Provider Layer]]
- [[04 Providers/Index|Providers]]
