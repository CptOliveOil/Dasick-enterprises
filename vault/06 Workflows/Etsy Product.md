---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Opportunity research then a drafted listing (dormant)
key: etsy_product
related:
  - [[Etsy]]
tags:
  - workflow
---

# Etsy Product

> [!info] Definition
> `etsy_product` in `lib/workflows/definitions.ts`

## Diagram

```mermaid
flowchart LR
    O[etsy.research.opportunities] --> L[etsy.listing.write]
    L -.->|⛔| A[Listing approval]
```

## Steps

Two steps.

## Approvals

A `listing` approval.

## Retries

Per step.

## Expected outputs

A drafted listing.

## Artifacts produced

`etsy_opportunities` · `etsy_listings`

## Related

- [[Etsy]]
