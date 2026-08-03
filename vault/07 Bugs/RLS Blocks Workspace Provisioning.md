---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Provisioning inserted a row the policy forbids
severity: high
commit: 2087d93
resolved: 2026-07
related:
  - [[Row Level Security]]
  - [[workflow_definitions]]
  - [[Supabase]]
tags:
  - bug
---

# RLS Blocks Workspace Provisioning

> [!bug] Problem
> `POST /api/workspace/setup` failed with `workflow_definitions: new row violates row-level security policy`.

## Symptoms

A new real workspace could not be created at all.

## Root cause

Provisioning inserted built-in workflow definitions as **ownerless** rows.
Migration `0003` deliberately makes ownerless rows immutable — they are the
shared library.

The insert was also **vestigial**: the table is never read at runtime. Built-in
workflows live in code.

## Investigation

Confirmed the operator's own diagnosis, then checked whether anything read the
table. Nothing did.

## Fix

- Removed the insert, with a comment explaining that built-ins are code
- `tests/rls-store.ts`: an in-memory store enforcing the **actual SQL policies**,
  which fails loudly for any untranscribed table
- The setup route returns proper JSON on refusal instead of an empty body

## Tests added

Proved by temporarily re-adding the insert: four tests failed with the exact production message.

## Commit

`2087d93`

## Lessons learned

**Do not weaken production security to make a bug go away.** The instruction was
explicit and correct — the fix was a deletion.

**A test double that accepts everything tests nothing.** `MemoryStore` accepted
a write Postgres would refuse, which is exactly how this shipped.

## Related

- [[Row Level Security]]
- [[workflow_definitions]]
- [[Supabase]]
