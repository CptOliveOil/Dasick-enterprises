---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What a test here is for
related:
  - [[Regression Tests]]
  - [[Smoke Tests]]
  - [[Coverage]]
tags:
  - testing
---

# Testing Philosophy

> [!abstract] The rule
> A test exists to make a **specific past or plausible failure impossible**, not
> to demonstrate that code runs.

## Principles

**Assert the property, not the implementation.** `expect(production).toEqual(demo)`
says the two modes build the same graph. It survives refactoring; a snapshot of
the graph would not.

**A test that would have caught the bug, or it is not a regression test.** Every
bug fix is verified by reverting the fix and watching the new test fail. That is
recorded in each [[07 Bugs/Index|bug page]].

**Never spend money.** Every provider test intercepts `fetch`. A test that
reached a real provider would charge whoever ran it.

**Never leak a secret.** Provider tests assert that a key does not survive an
error path, does not appear in a URL, and does not appear in a descriptor.

**Test doubles must refuse what production refuses.** `tests/rls-store.ts`
enforces the actual SQL policies and **fails loudly for any untranscribed
table** — a double that accepts everything is how
[[RLS Blocks Workspace Provisioning]] shipped.

**Exercise the path nobody takes.** [[Step Key Collision]] lived where every
fixture built missions the same way.

## Current state

| | |
| --- | --- |
| Test files | 23 |
| Tests | 509 passing, 1 skipped |
| Typecheck | clean |
| Build | compiles |

```bash
npx vitest run        # everything
npx tsc --noEmit      # typecheck
npm run build         # production build
```
