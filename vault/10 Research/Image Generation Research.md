---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Stills, thumbnails and refusals
related:
  - [[OpenAI]]
  - [[Asset Agent]]
  - [[Thumbnail]]
  - [[Copyright Review]]
tags:
  - research
---

# Image Generation Research

**Scene stills and thumbnails are different jobs.** Different aspect ratios,
different quality tiers, different prompt discipline. Keeping them as one use
case produced thumbnails that read as stills.

**A refusal must fail the step.** A provider that quietly returns *something*
when it dislikes a prompt puts a placeholder in the render. Ours throws.

**Generated does not mean cleared.** A prompt naming protected property produces
an asset classified `fair_use_review_required`, not `generated_original`. See
[[Never Claim Legal Safety]].

**Concrete beats abstract.** Sections naming dates, places and figures can be cut
to pictures; abstractions become stock footage. The quality score measures this.


## Related

- [[OpenAI]]
- [[Asset Agent]]
- [[Thumbnail]]
- [[Copyright Review]]
