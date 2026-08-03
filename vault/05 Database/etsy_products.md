---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A product concept between an opportunity and a listing. Dormant.
migration: `0001`
scope: business-scoped
related:
  - [[Etsy]]
  - [[etsy_listings]]
tags:
  - table
  - database
---

# etsy_products

> [!info] Purpose
> A product concept between an opportunity and a listing. Dormant.

## Key columns

`opportunity_id`, `name`, `status`

## Relationships

Child of an opportunity; parent of a listing.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Etsy Listing Agent]]

## Migration history

`0001`

## Related

- [[Etsy]]
- [[etsy_listings]]
