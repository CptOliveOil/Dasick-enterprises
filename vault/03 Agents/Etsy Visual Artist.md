---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Generates artwork, upscales it, crops every aspect ratio, composites mockups
related:
  - [[Etsy]]
  - [[etsy_products]]
  - [[Provider Layer]]
  - [[Etsy Product Designer]]
tags:
  - agent
---

# Etsy Visual Artist

> [!info] Purpose
> Produce every visual asset a product listing needs, from one design concept.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `etsy.artwork.generate`, `etsy.artwork.upscale`, `etsy.artwork.variants`, `etsy.mockups.generate` |

## Inputs

- `etsy_products.design_concept`, written by [[Etsy Product Designer]]

## Outputs

- Artwork (`media_assets`, 2048×2048, via the image provider — same
  `getImageProvider()` the YouTube pipeline uses, so Demo Mode, Development
  and Production behave identically here too)
- An upscaled version (4096×4096, ffmpeg Lanczos scaling — real resampling,
  not AI super-resolution, and labelled as such)
- Three aspect-ratio crops: `1:1` (3000×3000), `4:5` (3000×3750), `16:9`
  (3000×1688) — a cover-scale then a centre crop, never a stretch
- Two mockup previews — the artwork composited onto a plain matte canvas
  locally via ffmpeg, explicitly labelled as a composited preview rather than
  a photographed physical mockup

## Prompt philosophy

This is a provider-mode agent — no prompt of its own beyond the artwork
prompt the Product Designer already wrote. Every generation step is
idempotent: a retry checks whether the product already has the asset before
spending anything again.

## Failure examples

- n/a — new capability, no incidents recorded yet.

## Future ideas

- Real photographed mockup templates (a small library of product-context
  images to composite onto) would read more convincingly than a plain matte
  canvas. Deliberately not built yet — the composited version is honest about
  what it is and unblocks shipping a complete product today.

## Related

- [[Etsy]]
- [[etsy_products]]
- [[Provider Layer]]
- [[Etsy Product Designer]]
