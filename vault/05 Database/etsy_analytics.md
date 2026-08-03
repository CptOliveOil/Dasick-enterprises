---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Per-store, per-day figures. Dormant.
migration: `0001`
scope: business-scoped
related:
  - [[Etsy]]
  - [[Business Memory]]
  - [[Never Invent Metrics]]
tags:
  - table
  - database
---

# etsy_analytics

> [!info] Purpose
> Per-store, per-day figures. Dormant.

## Key columns

`store_id`, `date`, `visits`, `orders`, `revenue`, `conversion_rate`

## Relationships

**Per store and per day — not per listing.** This is why [[Business Memory]]
records commerce outcomes as unknown rather than dividing a shop's takings
between its listings and calling the result a measurement.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Business Memory]] (deliberately does not use it)

## Migration history

`0001`

## Related

- [[Etsy]]
- [[Business Memory]]
- [[Never Invent Metrics]]
