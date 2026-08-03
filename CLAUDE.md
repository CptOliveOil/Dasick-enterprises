# Command Centre — working agreement

## The vault is the project's memory

`vault/` is an Obsidian vault and the single source of truth for **why** this
codebase is the way it is. Read it before changing anything non-trivial; the
constraints that are not obvious from the code live there.

Start at `vault/00 Dashboard/Home.md`.

## Documentation must never drift from the implementation

A change that alters behaviour and leaves the vault untouched is an incomplete
change. Update the vault **in the same commit** as the code.

| When you | Update |
| --- | --- |
| Fix a bug | A page in `vault/07 Bugs/` — problem, symptoms, root cause, investigation, fix, tests, commit, **lesson learned**. Never delete a bug page. |
| Add or change a provider | Its page in `vault/04 Providers/` — env vars, costs, limits, auth, failure modes, implementation status. |
| Change architecture | The page in `vault/01 Architecture/` — responsibilities, inputs, outputs, dependencies, failure modes. |
| Change a workflow | `vault/06 Workflows/`, including the Mermaid diagram. |
| Make a decision hard to reverse | An ADR in `vault/08 Decisions/` — decision, reason, alternatives, trade-offs, consequences. |
| Add a table or migration | A page in `vault/05 Database/` and a row in `vault/01 Architecture/Migrations.md`. |
| Add an endpoint | A page in `vault/11 APIs/`. |
| Complete a milestone | `vault/09 Roadmap/Current Phase.md` and `Roadmap.md`. |

Use the templates in `vault/15 Templates/`. Follow
`vault/00 Dashboard/Vault Conventions.md` for naming, metadata and tags.

## Honesty rules

1. Never document something as built when it is not — use `status: planned`.
2. Never delete a bug page. The pattern outlives the fix.
3. Never soften a lesson.
4. Record what was **rejected**, not only what was chosen.
5. Bump `updated` in the frontmatter on every substantive edit.

## Verification

Before reporting work complete:

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Optional, for renderer changes:

```bash
RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
```
