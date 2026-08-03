---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Three guards silently matched nothing
severity: high
commit: cbc2671
resolved: 2026-08
related:
  - [[Copyright Review]]
  - [[Mode System]]
  - [[Quality Control]]
tags:
  - bug
---

# Simulated Provider Name Mismatch

> [!bug] Problem
> Checks written as `asset.provider === 'simulated'` never fired, because assets store the provider descriptor **name**: `Simulated (Demo Mode)`.

## Symptoms

Production Mode honesty checks, the copyright filter and the quality gate all passed regardless.

## Root cause

An equality comparison against a slug that is never stored. The stored value is the human-readable descriptor name.

## Investigation

Surfaced when the demo pipeline blocked on copyright: the exclusion meant to skip simulated assets was not matching them.

## Fix

`isSimulatedProvider()` matching `/simulated/i`, used everywhere a simulated asset must be recognised.

## Tests added

`tests/studio.test.ts` asserts the matcher against the stored name, the slug and a real provider name.

## Commit

`cbc2671`

## Lessons learned

**A guard that never fires looks identical to a guard that always passes.**
Nothing failed; the checks simply did nothing.

**Compare against what is stored, not what you assume is stored.**

## Related

- [[Copyright Review]]
- [[Mode System]]
- [[Quality Control]]
