---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Demo, Development and Production — one workflow, different implementations
related:
  - [[Provider Layer]]
  - [[Rendering Pipeline]]
  - [[Simulated Providers Must Never Be Silent]]
tags:
  - core
  - architecture
---

# Mode System

> [!info] Purpose
> The only difference between a demo and a real studio is which implementation answers each provider call. The task graph is identical, and a test asserts it.

**Code** — `lib/modes.ts`

## Responsibilities

- Infer the mode: no database → `demo`; database → `production`
- Honour `COMMAND_CENTRE_MODE`, except that a workspace with a database may never call itself a demo
- Decide whether simulation is allowed and whether real adapters may be used

## Inputs

- Environment: Supabase configuration, `COMMAND_CENTRE_MODE`, `DISABLE_SIMULATED_MEDIA`

## Outputs

- The current mode and two predicates: `simulationAllowed()`, `isBillable()`

## Dependencies

- Read by [[Provider Layer]], [[Agent Engine]] and quality control

## Failure modes

- **Demo with real keys** → must not spend. Guarded and tested.
- **Production with a missing provider** → blocks; never simulates.
- **Simulated asset in a real workspace** → quality control fails.

## Future improvements

- Per-business mode, so one channel can be live while another is being trialled

## Related

- [[Provider Layer]]
- [[Rendering Pipeline]]
- [[Simulated Providers Must Never Be Silent]]
