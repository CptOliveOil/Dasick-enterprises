---
status: resolved
created: 2026-10-09
updated: 2026-10-09
owner: fayaz
summary: Final approval immediately ran the publish step — which failed the mission in every seeded workspace, would otherwise have uploaded without the consent the UI promised, and could not have read the file anyway
severity: critical
commit:
resolved: 2026-10-09
related:
  - [[Publisher]]
  - [[YouTube API]]
  - [[Faceless YouTube Video]]
  - [[Authority Model]]
tags: [bug]
---

# Final Approval Ran The Upload Step Unasked

> [!bug] Problem
> Approving the finished video turned the mission **FAILED**: "Authority level 0
> is below the level 1 this action requires." The button had just said
> *"It does not upload it — publishing is a separate, gated action."*

## Symptoms
Found in the October 2026 recovery, driving `next start` (Demo Mode) through
final approval. `publish` failed, `analytics` was cancelled, mission `failed`.

## Root cause
Three faults on one step nobody had run end to end:

1. **No upload consent.** `publish` depends only on `quality_check`, so final
   approval released it straight away. The step checked `video.status ===
   'ready'` — which final approval itself sets — and nothing else. The manual
   publish action respected `auto_publish_after_approval`; the workflow step
   ignored it. Had the agent been allowed to run, final approval *was* the
   upload.
2. **The agent could never run.** `youtube.publish` and
   `youtube.analytics.collect` were added (Aug 2026) to the seeded YouTube
   Analyst, which had been authority **0** since the first commit. The engine
   refuses every run below level 1. Channel analysis had never worked either.
   The test workforce gave its publisher level 3 with a comment saying it
   "mirrors the seed" — it did not.
3. **Wrong file.** The step passed `finalAsset.storage_path` — a storage key
   like `biz/final_video/<id>.mp4` — as `videoPath`; the YouTube adapter
   `fs.readFile`s it relative to the server's cwd. Every real upload would have
   failed with ENOENT. The simulated publisher never reads the file.

## Investigation
The seeded workspace (and every real workspace — `provision.ts` copies the
seed) reproduced 2. A recording publisher in a test exposed 3. Reading the
manual publish route showed it returning **501 "not yet implemented"** even
when connected — two publish paths, neither of which could upload.

## Fix
- `youtube.publish` raises a `publish` approval ("Upload to YouTube
  (private) — …") after its readiness checks and before uploading, unless
  `auto_publish_after_approval` is on. Approving re-queues the step with
  `publish_authorised: true`, the same mechanism as a spend gate. The studio
  review screen handles `publish` approvals too.
- The step resolves the file with `assetLocalPath`.
- Seed: YouTube Analyst authority 3 (external actions, each stopping for
  approval — which is now literally true).
- "This would publish externally. Approving makes the content public" → says
  it uploads with the visibility shown, private by default.

- Existing workspaces: authority cannot be edited anywhere in the product, so a
  stored 0 on a **built-in** agent can only be the old seed. When such an agent
  is refused at run time, `correctBuiltInAuthority` raises it to the current
  seed level, logs that it did, and the step proceeds. Custom agents are never
  touched.

Not changed: the manual publish action (still 501).

## Tests added
`tests/publish-gate.test.ts` — no upload on final approval; one private upload
after the gate, from an absolute path that exists; a rejected gate uploads
nothing; every seeded agent with capabilities can actually run; an old
level-0 built-in analyst is corrected and runs, a custom one is not touched.

## Commit
(see git log — "Give the YouTube upload its own approval")

## Lessons learned
A safety property claimed in UI text is not a safety property until the code
path behind it has been run. And a test double that "mirrors" production is a
claim too — this one mirrored a value the seed never had.

## Related
- [[Approving A Video Was Permanently Disabled Outside Supabase Storage]]
- [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
