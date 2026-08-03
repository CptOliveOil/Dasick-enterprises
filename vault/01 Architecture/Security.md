---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Secrets, isolation and the irreversible actions
related:
  - [[Provider Layer]]
  - [[Row Level Security]]
  - [[Authentication]]
  - [[Secrets Never Leave The Server]]
tags:
  - core
  - architecture
---

# Security

> [!info] Purpose
> Keys never reach the browser, never reach an error message and never reach a report. Publishing is the one irreversible act and is gated accordingly.

**Code** — `lib/integrations/providers/http.ts`, `lib/config.ts`

## Responsibilities

- Server-only configuration; nothing prefixed `NEXT_PUBLIC_` for secrets
- `redact()` scrubs key-shaped strings from every provider error
- Provider descriptors name variables, never values
- Owner-scoped media routes

## Inputs

- Environment configuration

## Outputs

- Safe errors, safe descriptors, safe reports

## Dependencies

- [[Provider Layer]]
- [[Row Level Security]]

## Failure modes

- **A key in `task.error`** → prevented by redaction; asserted by test.
- **A plausible external id from a simulated publish** → prevented; the simulated publisher marks itself.

## Future improvements

- Secret rotation reminders
- Audit log of settings changes

## Related

- [[Provider Layer]]
- [[Row Level Security]]
- [[Authentication]]
- [[Secrets Never Leave The Server]]
