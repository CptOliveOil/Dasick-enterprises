---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One per bug, verified by reverting the fix
related:
  - [[07 Bugs/Index|Bugs]]
tags:
  - testing
---

# Regression Tests

Every page in [[07 Bugs/Index|Bugs]] names its test.

| Bug | Test file |
| --- | --- |
| [[Blank UUID In Research]] | `uuid-integrity.test.ts` |
| [[Structured Output Validation Failure]] | `anthropic-structured.test.ts` |
| [[RLS Blocks Workspace Provisioning]] | `rls-store.ts` + `real-mode.test.ts` |
| [[Script Not Found In AI Planned Missions]] | `script-resolution.test.ts` |
| [[Step Key Collision]] | `executor-state.test.ts` |
| [[Zoompan Frame Explosion]] | `render-smoke.test.ts` |
| [[Simulated Provider Name Mismatch]] | `studio.test.ts` |
| [[Demo Mode Would Have Spent Money]] | `providers.test.ts` |

> [!important] Verification ritual
> Revert the fix. Watch the test fail with the production symptom. Restore the
> fix. A regression test that has never failed is a hypothesis.
