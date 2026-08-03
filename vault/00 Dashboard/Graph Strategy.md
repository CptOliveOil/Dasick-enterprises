---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Making the graph mean something
related:
  - [[Vault Conventions]]
tags:
  - meta
  - dashboard
---

# Graph Strategy

The graph is a **diagnostic**, not decoration. A meaningful one shows
architecture at the centre, with providers, tables and agents as satellites.

## Colour groups

| Query | Colour | Reads as |
| --- | --- | --- |
| `path:"01 Architecture"` | amber | the spine |
| `path:"04 Providers"` | blue | the outside world |
| `path:"05 Database"` | green | persistence |
| `path:"03 Agents"` | purple | the workforce |
| `path:"07 Bugs"` | red | scars |
| `path:"08 Decisions"` | white | constraints |

## What a healthy graph looks like

- [[Mission Engine]], [[Agent Engine]] and [[Provider Layer]] are the densest nodes
- Every table connects to at least one architecture page
- Bug pages connect to the system they broke **and** the decision they produced
- No isolated notes

## What to do about orphans

Filter to `-file:Index` and look for unconnected nodes. An orphan is either
missing links or does not deserve a page.

## Local graph

Open it beside any architecture page — depth 2 shows exactly what a change to
that system will touch. This is the most practical use of the graph.
