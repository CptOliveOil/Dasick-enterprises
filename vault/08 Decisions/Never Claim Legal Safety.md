---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Provenance is bookkeeping; clearance is not ours to give
adr: 9
decided: 2026-07
related:
  - [[Copyright Review]]
  - [[Pokemon Channel]]
  - [[youtube_copyright_reviews]]
tags:
  - decision
  - adr
---

# ADR-009 — Never Claim Legal Safety

> [!success] Decision
> Provenance is classified deterministically from what was recorded. The model
comments but does not classify, and is explicitly told never to state that
anything is safe, cleared or fair use. The licence report says in the document
itself that it is not legal advice.

**Status** — accepted

## Reason

A model can be argued into "probably fine"; a lookup table cannot. And a
document that lists licences and reaches a verdict reads like clearance whether
or not anyone intended it to.

## Alternatives considered

- **Letting the model classify** — rejected; it is the one thing it must not decide.
- **Auto-approving generated images** — rejected; an original rendering of a trademarked character is still that character.

## Trade-offs

More items land in `fair_use_review_required`, and the operator must decide each one.

## Consequences

`unresolved` blocks publishing. `fair_use_review_required` warns and requires a person. The system never says a video is safe.

## Related

- [[Copyright Review]]
- [[Pokemon Channel]]
- [[youtube_copyright_reviews]]
