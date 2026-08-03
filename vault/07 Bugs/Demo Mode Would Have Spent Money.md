---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Credentials were checked before the mode
severity: high
commit: a8805c1
resolved: 2026-08
related:
  - [[Mode System]]
  - [[Provider Layer]]
  - [[Budget System]]
tags:
  - bug
---

# Demo Mode Would Have Spent Money

> [!bug] Problem
> The provider registry checked `elevenLabsConfigured()` before `simulationAllowed()`, so a demo workspace with keys in the environment would have made real, billable calls.

## Symptoms

Caught by a test written before the fix; never reached production.

## Root cause

Ordering. Demo Mode is defined as "nothing can be spent", and the credential check came first.

## Investigation

Writing the test "the registry never spends in Demo Mode" exposed it immediately. A second ordering bug surfaced at the same time: a stray key in a demo environment threw "no adapter registered" instead of falling through to simulation.

## Fix

`realProvidersAllowed()` is checked **before** any credential, and the unregistered-adapter guard respects the mode too.

## Tests added

`tests/providers.test.ts` — asserts simulated providers are returned even with every real credential present.

## Commit

`a8805c1`

## Lessons learned

**Write the safety test before the feature.** This one found the bug on its
first run.

**Ordering is a security property.** Both checks were correct; only their order
was wrong.

## Related

- [[Mode System]]
- [[Provider Layer]]
- [[Budget System]]
