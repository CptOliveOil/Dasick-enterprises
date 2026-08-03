---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
  - [[Architecture Map]]
  - [[Current Phase]]
  - [[Blockers]]
  - [[Index of Systems]]
tags:
  - dashboard
---

# Command Centre

> [!abstract] What this is
> Command Centre is an AI business operating system: an autonomous workforce of
> specialist agents, visualised as a solar system, that researches, writes,
> produces and publishes work for one or more businesses.
>
> This vault is its permanent memory. Code changes; the reasoning behind the
> code lives here.

## Right now

| | |
| --- | --- |
| **Phase** | [[Current Phase\|Studio — making Production Mode operable]] |
| **Latest commit** | `cbc2671` — Studio: real renders, real captions, real licences |
| **Tests** | 509 passing, 1 skipped (23 files) |
| **Migrations applied** | 0001 → 0008 |
| **Mode** | See [[Mode System]] |

## Open blockers

See [[Blockers]] for the live list. The short version:

- [[Scene Replacement]] and [[Render Versioning]] are not built — a re-render overwrites.
- Music upload UI missing (mixing works; see [[Rendering Pipeline]]).
- No real provider adapter for video clips or music.

## Start here

- **How it fits together** → [[Architecture Map]]
- **What runs when you type an instruction** → [[Mission Engine]] → [[Workflow Engine]]
- **Why something is the way it is** → [[08 Decisions/Index|Decisions]]
- **What broke before** → [[07 Bugs/Index|Bugs]]
- **What is next** → [[Roadmap]]

## Quick links

| Area | Index |
| --- | --- |
| Architecture | [[Index of Systems]] |
| Businesses | [[02 Businesses/Index\|Businesses]] |
| Agents | [[03 Agents/Index\|Agents]] |
| Providers | [[04 Providers/Index\|Providers]] |
| Database | [[05 Database/Index\|Tables]] |
| Workflows | [[06 Workflows/Index\|Workflows]] |
| Bugs | [[07 Bugs/Index\|Bugs]] |
| Decisions | [[08 Decisions/Index\|Decisions]] |
| APIs | [[11 APIs/Index\|Endpoints]] |
| Testing | [[Testing Philosophy]] |
| Templates | [[15 Templates/Index\|Templates]] |

## Recently changed systems

```dataview
TABLE updated, status
FROM "01 Architecture"
SORT updated DESC
LIMIT 10
```

## Everything needing attention

```dataview
TABLE status, file.folder AS area
WHERE status = "draft" OR status = "needs-review" OR status = "stale"
SORT file.folder ASC
```
