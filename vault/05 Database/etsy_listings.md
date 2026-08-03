---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A drafted listing awaiting approval. Dormant.
migration: `0001`
scope: business-scoped
related:
  - [[Etsy]]
  - [[Etsy Listing Agent]]
  - [[etsy_opportunities]]
tags:
  - table
  - database
---

# etsy_listings

> [!info] Purpose
> A drafted listing awaiting approval. Dormant.

## Key columns

`product_id`, `title`, `description`, `tags[]`, `price`, `status`

## Relationships

`product_id` is nullable — see [[Blank UUID In Research]] for why optional relationships are nullable rather than empty strings.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Etsy Listing Agent]], [[Approval System]]

## Migration history

`0001`

## Related

- [[Etsy]]
- [[Etsy Listing Agent]]
- [[etsy_opportunities]]
