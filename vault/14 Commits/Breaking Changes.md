---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Changes requiring operator action
related:
  - [[Migrations]]
tags:
  - commits
---

# Breaking Changes

| Commit | Change | Action required |
| --- | --- | --- |
| `cbc2671` | `youtube_captions.srt` added | Migration `0008` (already required) |
| `a8805c1` | `getStore()` throws instead of falling back to demo | None — but an expired session now shows 401 |
| `c12e37f` | Migration `0008` | Run it |
| `217452f` | Migration `0007` | Run it |
| `19b9812` | Migration `0006`; **no default budget** | Set an AI budget or nothing runs |
| `46dc67e` | Derived step keys changed | Existing missions keep old keys; the resolver reads any key |

See [[Migrations]].
