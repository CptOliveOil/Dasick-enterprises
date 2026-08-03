---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The vault lives with the code
related:
  - [[Claude Workflow]]
  - [[Maintenance]]
tags:
  - meta
  - dashboard
---

# Git Strategy

## The vault is in the repository

`vault/` sits alongside `lib/` and `app/`. That is deliberate:

- A change and its documentation land in **one commit**
- A pull request diff shows whether the docs were updated
- Checking out an old commit gives the documentation as it was then
- Claude Code can read and write it without leaving the repository

The alternative — a separate vault repository — guarantees drift, because
nothing forces the two to move together.

## Commits

Documentation-only changes:

```
docs(vault): record the zoompan frame explosion
```

Code changes update the vault **in the same commit**. The commit message
explains the reasoning; the vault page is the durable version of it.

## The Obsidian Git plugin

Useful for editing in Obsidian directly. Configure:

- Auto-commit every 30 minutes with message `vault: auto-save`
- **Auto-push off** — you want to see what you are pushing
- Pull on startup

If you edit the vault mostly through Claude Code, you may not need it at all.

## `.gitignore`

```
vault/.obsidian/workspace.json
vault/.obsidian/workspace-mobile.json
vault/.trash/
```

Keep the rest of `.obsidian/` committed so plugin and graph settings are shared.

## Conflicts

Rare, because notes are small and topic-scoped. Where one happens the note is
usually short enough to merge by hand. This is a reason to keep notes focused.
