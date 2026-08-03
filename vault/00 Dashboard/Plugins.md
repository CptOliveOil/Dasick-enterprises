---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What to install, and what to skip
related:
  - [[Vault Conventions]]
tags:
  - meta
  - dashboard
---

# Suggested Plugins

## Essential

| Plugin | Why |
| --- | --- |
| **Dataview** | Every index page here uses it. Without it they render as code blocks. |
| **Templater** or core **Templates** | Point it at `15 Templates`. |
| **Git** | Commits the vault on a schedule. See [[Git Strategy]]. |

## Recommended

| Plugin | Why |
| --- | --- |
| **Excalidraw** | Sketches Mermaid cannot express |
| **Advanced Tables** | This vault is table-heavy |
| **Linter** | Enforces frontmatter shape; can bump `updated` automatically |
| **Style Settings** | Tune callouts and graph colours |

## Skip

**Daily Notes** — this is not a journal. Session logs use [[Meeting Notes]].

**Kanban** — [[Backlog]] is ordered prose. A board invites busywork.

**Tag Wrangler** — the tag list is deliberately short enough not to need it.

## Core settings

- Files & Links → **New link format: shortest path**, so links stay readable
- Files & Links → Default location for new notes: **same folder**
- Editor → **Show frontmatter** on, so metadata stays visible
- Graph → colour groups by folder (see [[Graph Strategy]])
