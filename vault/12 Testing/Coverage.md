---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What is covered, and what deliberately is not
related:
  - [[Testing Philosophy]]
tags:
  - testing
---

# Coverage

## Well covered

Mission and workflow engines · approvals and dossiers · budgets and authority ·
provider adapters (mocked HTTP) · mode equivalence · provenance and licences ·
subtitle formatting and validation · timeline validation · business memory ·
RLS write policies.

## Deliberately not covered

| Area | Why |
| --- | --- |
| Real provider calls | Would cost money on every run |
| React component rendering | The logic lives in server modules that are tested |
| The galaxy scene | WebGL; the layout maths is tested separately |
| Long renders | The smoke test covers a short one; a 12-minute render is minutes of CPU |

## Gaps worth closing

- Loudness and audio-level measurement in [[Quality Control]]
- Storage failure paths in [[Media Pipeline]]
- Concurrent mission execution
