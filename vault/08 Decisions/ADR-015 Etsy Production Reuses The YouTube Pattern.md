---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One capability per generation step, one media_assets table, ffmpeg over a new dependency
adr: 15
decided: 2026-08
related:
  - [[Etsy Product Build]]
  - [[media_assets]]
  - [[Provider Layer]]
tags:
  - decision
  - adr
---

# ADR-015 — Etsy Production Reuses The YouTube Pattern

> [!success] Decision
> The Etsy artwork pipeline (design concept, artwork, upscale, aspect-ratio
> variants, mockups, packaging) is built as more provider-mode capabilities
> on the one existing agent engine, storing assets in the existing
> `media_assets` table with a new `product_id` column — not a second media
> system, a new provider dependency, or a parallel `etsy_assets` table.

**Status** — accepted

## Reason

An audit for "what stops shipping a complete Etsy product" found the
pipeline covered 3 of 11 required outputs — research plus a text-only
listing — with zero image capability, despite the exact provider
infrastructure it needed (`getImageProvider()`, `lib/media/ffmpeg.ts`,
`createMediaAsset()`) already existing and proven by the YouTube pipeline.
Building a second visual pipeline for Etsy would have duplicated exactly the
coupling the YouTube provider-mode capability pattern exists to prevent.

## Alternatives considered

- **A new `etsy_assets` table** — rejected. `media_assets` already carries
  `video_id`/`scene_id` as optional foreign keys per asset kind; adding
  `product_id` alongside them is the same shape, and every existing
  provenance, storage and serving code (`getMediaStorage()`,
  `/api/media/[id]`, `playableUrl()`) works unmodified.
- **A dedicated upscaling provider (e.g. a paid super-resolution API)** —
  rejected for now. ffmpeg's Lanczos scaling is real, already bundled, and
  honestly labelled as resampling rather than AI enhancement. Revisit if a
  real deployment finds the quality insufficient.
- **Real photographed mockup templates** — rejected for this pass. Would
  need a template asset library with its own licensing to track. The
  composited-preview approach ships today and says plainly what it is;
  templates are recorded as a future improvement on
  [[Etsy Visual Artist]], not abandoned.
- **One workflow with an approval gate on the whole batch of research
  results** (the workflow as it existed before this change) — rejected.
  `requires_approval` on the `research` step gated *every* opportunity found
  behind one decision, and nothing ever turned an approved opportunity into
  a product — the chain was structurally broken. Split into `etsy_product`
  (research only, unapproved) and `etsy_product_build` (seeded from one
  chosen opportunity), mirroring how `youtube_ideas` and `youtube_script`
  already split idea generation from production.

## Trade-offs

Two new agents (Etsy Product Designer, Etsy Visual Artist) rather than
folding every new capability onto the existing Researcher and Listing
agents — matches the granularity YouTube already uses (a Visual Director is
separate from an Asset Agent) rather than one agent doing everything.

## Consequences

- `media_assets.type` gained `archive`; `CreateAssetInput` gained
  `productId`; both are additive and do not change YouTube's asset creation
  path.
- `zip()` in `lib/approvals/export.ts` now accepts binary entries
  (`string | Uint8Array`), reused for the Etsy package instead of writing a
  second zip writer.
- `checkSpend()` is called with `videoId: null` for Etsy's image spend —
  correct per-step ceiling and approval-threshold checks, but it does not
  track cumulative spend across one product's build the way `videoSpend()`
  does for a video. Acceptable for now; revisit if Etsy spend needs the same
  cumulative ceiling YouTube has.

## Related

- [[Etsy Product Build]]
- [[media_assets]]
- [[Provider Layer]]
