---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Naming, metadata, tags and linking
related:
  - [[Home]]
  - [[Daily Workflow]]
  - [[Maintenance]]
tags:
  - meta
  - dashboard
---

# Vault Conventions

## Naming

**Notes are named after the thing, not the document.** `Mission Engine`, not
"Mission Engine Documentation". `Blank UUID In Research`, not "Bug 3" and not the
error text.

- Title Case. No dates in filenames except session logs.
- One note per concept. If two notes want the same name, one of them is wrong.
- Table pages are named **exactly** as the table: `youtube_scripts`.
- Decision pages are named after the decision: `Budgets Have No Default`.
- Bug pages are named after the *cause* where it is known: `Step Key Collision`.

## Metadata schema

```
---
status:   see below
created:  YYYY-MM-DD
updated:  YYYY-MM-DD          # bump on every substantive edit
owner:    fayaz
summary:  one line, used by every Dataview table
related:  [[…]] list
tags:     kebab-case
---
```

Type-specific keys: `severity`, `commit`, `resolved` (bugs) · `adr`, `decided`
(decisions) · `key` (workflows) · `interface` (providers) · `method`, `path`
(APIs) · `scope`, `migration` (tables).

### `status` values

| Value | Means |
| --- | --- |
| `stable` | Accurate and unlikely to change soon |
| `living` | Expected to change often — indexes, roadmap, blockers |
| `draft` | Being written; not yet trustworthy |
| `needs-review` | Suspected drift from the code |
| `stale` | Known to be out of date |
| `planned` | Describes something not built |
| `resolved` | A closed bug |
| `accepted` / `proposed` / `superseded` | Decisions |
| `dormant` | A business deliberately not being developed |

`draft`, `needs-review` and `stale` all surface on [[Home]].

## Tags

Coarse and few. Folders already carry the type; tags carry the **cross-cutting**
concern.

`architecture` `agent` `provider` `workflow` `table` `database` `bug` `decision`
`adr` `research` `api` `testing` `deployment` `roadmap` `template` `index`
`business` `core` `planned` `pokemon` `meta`

`core` marks the pages a newcomer must read first.

## Linking

**Every note links out, and every note is linked to.** An orphan is a note
nobody will find again.

- Architecture → the providers, tables, workflows and agents it touches
- Bugs → the systems they broke and the decision they produced
- Decisions → the systems they constrain
- Tables → the systems that read and write them
- Agents → their capabilities, providers and records

Prefer a link to a restatement. If you find yourself explaining
[[Row Level Security]] inside another page, link instead.

## Callouts

`> [!info]` purpose · `> [!warning]` a trap · `> [!danger]` money or
irreversibility · `> [!success]` a decision · `> [!bug]` a failure ·
`> [!important]` a rule · `> [!tip]` guidance · `> [!quote]` intent
