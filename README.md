# Command Centre

An AI business operating system. Command Centre runs an autonomous AI workforce
across several businesses — and presents that workforce as a living solar
system rather than a grid of cards.

Each planet is a real agent. Its glow is its actual status, the ring around it
means an approval is genuinely outstanding, and when a small craft flies from one
planet to another it is because that handoff was recorded. The galaxy is the
primary interface; every part of it is also reachable through ordinary lists,
tables and keyboard navigation.

Underneath it is a conventional, testable system: a single agent execution
engine, a database-driven workflow state machine, Zod-validated structured
output, an approval gate on anything with consequences, and per-agent cost
accounting.

---

## Contents

- [Quick start](#quick-start)
- [How to access Command Centre](#how-to-access-command-centre)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Demo mode](#demo-mode)
- [Going live: real mode](#going-live-real-mode)
- [How it works](#how-it-works)
- [Accounts, roles and access](#accounts-roles-and-access)
- [Custom agents](#custom-agents)
- [Daily operations](#daily-operations)
- [The YouTube production pipeline](#the-youtube-production-pipeline)
- [Islamic content](#islamic-content)
- [Pokémon research](#pokémon-research)
- [Galaxy architecture](#galaxy-architecture)
- [The AI YouTube Studio](#the-ai-youtube-studio)
- [Connecting real providers](#connecting-real-providers)
- [Studio: render, captions, licences](#studio-render-captions-licences)
- [Approvals: the editorial review](#approvals-the-editorial-review)
- [Resolving the canonical script](#resolving-the-canonical-script)
- [Business Intelligence Memory](#business-intelligence-memory)
- [Extending it](#extending-it)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project layout](#project-layout)

---

## Quick start

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env.local     # optional — it runs with an empty file
npm run dev
```

Open <http://localhost:3000>.

With no configuration at all the application starts in **demo mode**: nineteen
agents across three businesses — a YouTube channel, an Etsy shop and an Islamic
channel — with missions, live activity, approvals and finance, all seeded, all
labelled `Demo`, and all genuinely functional. Type an instruction into the
command bar and a real mission is planned, real tasks are created and real
agents run — including a full YouTube video, rendered locally through ffmpeg to
a file you can play.

Other scripts:

```bash
npm run build       # production build
npm start           # run the production build
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

---

## How to access Command Centre

Demo mode has no accounts, so a demo deployment is readable by anyone who finds
the URL. To run this as your private workspace, do all seven steps — the first
five are what turn authentication on.

### 1. Configure Supabase

Create a project at [supabase.com](https://supabase.com) and copy the project
URL and the anon key from Settings → API.

### 2. Run the migrations

In order: `0001_initial_schema.sql`, `0002_production_pipeline.sql`,
`0003_accounts_agents_islamic.sql`, `0004_operations.sql`, `0005_pokemon.sql`,
`0006_real_mode.sql`, `0007_business_memory.sql`, `0008_studio.sql`. Paste them into the
SQL editor, or use `supabase db push`. Migration `0003` creates the owner role
column, the role-immutability trigger and the Islamic tables; `0004` adds
mission priority and deadlines, memory provenance and the source resolution
table; `0005` adds the Pokémon opportunities table; `0006` adds the account AI
spending ceiling; `0007` adds `mission_outcomes`, the per-business record of
what finished work cost and how it performed.

### 3. Create your owner account — safely

The very first profile created on a fresh project becomes the **owner**; every
account created after that arrives as a `viewer`. That ordering is the whole
safety property, so create yours before anyone else can:

1. In the Supabase dashboard, go to **Authentication → Users → Add user**,
   enter your email and a password, and tick *Auto Confirm User*. Creating
   yourself from the dashboard rather than a public sign-up form means there is
   no window during which the sign-up endpoint is open and unclaimed.
2. Then go to **Authentication → Providers → Email** and **turn off "Enable
   sign-ups"**. Your account already exists; leaving sign-ups on lets a stranger
   register against your project. They would land as a `viewer` and see nothing
   they could change — but there is no reason to allow it at all.
3. Confirm it worked: `select id, email, role from public.profiles;` should show
   one row, with `role = 'owner'`.

Roles cannot be changed from the browser — a database trigger rejects any update
that alters `role`, so a compromised session cannot promote itself. To add a team
member later, insert them and set their role with SQL.

### 4. Configure environment variables

At minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add
`ANTHROPIC_API_KEY` for real agent output, and the media provider keys for real
media. See [Environment variables](#environment-variables); everything is
optional and nothing is faked when it is absent.

### 5. Deploy

Any platform that runs Next.js. On Vercel: import the repository, add the same
environment variables, deploy. Agent runs are slow — the routes that invoke
agents set `maxDuration = 300`.

### 6. Visit the deployment URL

Any unauthenticated request is redirected to `/login`; API routes return `401`
rather than data. There is no page that renders your workspace to a signed-out
visitor.

### 7. Sign in

Email and password. The session is stored in `httpOnly` cookies and refreshed on
every request by the middleware, so signing in once on a phone, tablet, laptop
and desktop keeps you signed in on all four. `/forgot-password` sends a
single-use reset link through Supabase's email provider, which lands on
`/reset-password` and signs every other device out when the password changes.

Then Command Centre loads your private workspace: your galaxy, your agents, your
missions, your finances. Nothing is shared, and — with RLS on every table —
nothing is reachable by anyone else even if they hold a valid session of their
own.

---

## Environment variables

Every variable is optional. Nothing is displayed as connected unless it is.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Set with the anon key to leave demo mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Safe in the browser — Row Level Security is what protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS; used for trusted background work. |
| `ANTHROPIC_API_KEY` | Primary AI provider. Without it, agents run simulated in Demo Mode and **stop** in a real workspace. |
| `ANTHROPIC_MODEL` | Default model. Defaults to `claude-sonnet-4-5`. |
| `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` | Optional alternative providers. |
| `YOUTUBE_API_KEY` | YouTube Data API. Required for live channel analytics. |
| `ETSY_API_KEY` | Etsy Open API. Required before any listing can be published. |
| `VOICE_PROVIDER` / `VOICE_PROVIDER_API_KEY` | Narration generation. |
| `IMAGE_PROVIDER` / `IMAGE_PROVIDER_API_KEY` | Thumbnail and scene imagery. |
| `VIDEO_PROVIDER` / `VIDEO_PROVIDER_API_KEY` | Scene video generation. |
| `STOCK_PROVIDER` / `STOCK_PROVIDER_API_KEY` | Licensed stock footage and stills. |
| `FFMPEG_PATH` | Override the bundled `ffmpeg-static` binary used for rendering. |
| `DISABLE_SIMULATED_MEDIA` | `true` makes missing media providers block instead of simulating, even in demo mode. |
| `DEFAULT_CURRENCY` | Display currency. Defaults to `GBP`. |

Provider keys are read in `lib/config.ts`, which is imported only by
server-side modules. No key reaches the browser — not the Anthropic key, not a
voice, image or video key, and not a YouTube refresh token. Settings reports
connection state and required variable *names*; a saved secret is never
displayed again.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL and anon key into `.env.local`.
3. Run the migrations, in order — `0001_initial_schema.sql`,
   `0002_production_pipeline.sql`, `0003_accounts_agents_islamic.sql`,
   `0004_operations.sql`, `0005_pokemon.sql`, `0006_real_mode.sql`,
   `0007_business_memory.sql`, `0008_studio.sql`. Either paste them into the SQL editor, or use the
   Supabase CLI:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```

4. Restart the dev server. Command Centre now requires sign-in and stores
   everything in Postgres.

`0001` creates the 33 core tables, their indexes, and Row Level Security
policies on every one. Tables that carry `owner_id` are restricted to
`auth.uid()`; child tables inherit ownership through their parent business,
agent, task or mission. A trigger creates a `profiles` row on sign-up.

`0004` adds mission priority and optional deadlines, memory provenance/status/
pinning for the memory approval gate, the `source_resolutions` table with its
override audit trail, and the `source` and `memory` approval kinds.

`0003` adds owner profiles (role, timezone, avatar), the columns
operator-created agents need, the Islamic tables, and an RLS audit — see
[Accounts, roles and access](#accounts-roles-and-access).

`0002` adds the production pipeline: `media_assets`, `youtube_voiceovers`,
`youtube_timelines`, `provider_jobs`, `youtube_render_jobs`,
`youtube_quality_checks`, `youtube_metadata`, `production_budgets` and
`production_settings`, with RLS on each. It also creates a **private** storage
bucket, `command-centre-media`, whose policies scope every object to the owner's
folder. Rendered video, narration, imagery and thumbnails are served through
`/api/media/[id]`, which re-checks ownership on every request — media is never
given a public URL.

A fresh Supabase project starts empty — no demo data is written to a real
database. Create your businesses and agents from Settings, or adapt
`lib/db/seed.ts`.

---

## Demo mode

Demo mode is not a mock. It is the same application running on a different
storage driver.

- **Same code paths.** Missions, the workflow engine, the approval system, cost
  accounting and the activity log all run exactly as they do against Postgres.
- **Clearly labelled.** Every seeded row carries `is_demo: true` and renders a
  `Demo` badge. The header shows `DEMO DATA`.
- **Not durable.** The in-memory store is reseeded when the server restarts.

When no AI provider is configured, agents run on a simulated provider that
synthesises schema-valid output from the same Zod schemas the real provider is
validated against. Its output is prefixed `[Simulated]` and the header shows
`AI SIMULATED`. The pipeline is real; only the text is not.

### Simulated media

Media is treated more strictly than text, because a file that does not exist
must never look like one that does.

- **Demo mode only.** `simulationAllowed()` requires demo mode *and*
  `DISABLE_SIMULATED_MEDIA` unset. Outside demo mode a missing provider always
  stops the mission and names the provider and the variables it needs. There is
  no path by which real mode silently substitutes a placeholder.
- **Always labelled.** A simulated asset is stored with `simulated: true`,
  renders a `SIMULATED` badge, and a video containing any simulated input shows
  `CONTAINS SIMULATED ASSETS` on the player.
- **Never public.** `public_url` stays `null`. Nothing is given a URL that looks
  like a real hosted asset.
- **Never mixed.** Demo rows carry `is_demo` and live in the in-memory store; a
  real Supabase project is never seeded.

The renderer is the exception, and honestly so: ffmpeg runs locally on real
input and produces a real file, so its output is not marked simulated even in
demo mode. Settings shows it as `Connected — Local ffmpeg`.

---

## Going live: real mode

Command Centre runs in one of two modes, and the difference is not cosmetic.

**Demo Mode** is what you get with no configuration: an in-memory store seeded
with clearly-labelled demo data, no accounts, and a simulated AI provider. It is
free, nothing persists, and everything is badged.

**Real mode** begins the moment Supabase is configured. From then on the rules
change in three ways that matter.

### Nothing is ever simulated

In a real workspace a missing provider **stops the task and names what is
missing**. It does not stand in, and it does not produce something that looks
like a model's answer:

```
Anthropic is not connected. Add ANTHROPIC_API_KEY to .env.local and restart
the app. Nothing was simulated — this workspace is real, so a missing provider
stops the task rather than inventing an answer.
```

There is one provider path (`resolveProvider` in `lib/integrations/ai/index.ts`)
and one execution engine, so this is not a mode the engine can be talked out of.
The media providers already worked this way; the AI provider now does too.

### Nothing spends until you set a ceiling

`ai_budgets` holds one row per account and **has no default**. Until the owner
sets a monthly ceiling in **Settings → AI budget** and turns execution on, no
paid model call runs at all. A limit nobody chose is not a limit.

Four figures, all yours:

| Setting | Does |
| --- | --- |
| Monthly ceiling | Hard stop across the whole workforce. Approval does not override it. |
| Per-mission ceiling | Stops one runaway mission from spending the whole month. |
| Ask me above | A single step estimated at or above this stops for approval first. |
| Warn me at | Where warnings begin, as a share of the ceiling. |

Estimates are made **before** the call, deliberately pessimistically, and an
unknown model is priced as the most expensive one — guessing low is how a
ceiling gets passed. Recorded spend comes from the token counts the API actually
returned.

**An agent cannot raise its own ceiling.** That is structural, not a promise in
a prompt: the permission (`ai_budget.manage`) is held by the owner alone and not
by admin, the only route that writes the table requires it, agents run inside
tasks and have no session at all, and the row-level policy is owner-only.

### Built-in workflows are code, not data

`createMission` resolves a workflow key through `findWorkflow` in
`lib/workflows/definitions.ts`. The `workflow_definitions` table is **not** read
for a built-in workflow and provisioning writes nothing to it — the shared
library (`owner_id is null`) is deliberately read-only under RLS, because a
signed-in user must not be able to inject a workflow into a library every
account reads. The table exists for owner-created custom workflows, which carry
an `owner_id` and are covered by the ordinary owner policy.

`tests/rls-store.ts` transcribes the migrations' policies into a store that
enforces them, so a write Postgres would refuse fails in CI rather than the
first time an operator clicks a button. When a migration changes a policy,
change it there too.

### Your workspace starts clean

A fresh Supabase account is genuinely empty, so **Settings** offers a one-time
setup that creates your workforce — the agents, their prompts, their
capabilities and their planets — and **nothing else**. No missions, no activity,
no revenue, no costs, no analytics, and every agent on zero completed tasks. The
demo's invented history stays in the demo, where invented revenue and invented
performance figures cannot be mistaken for measurements.

### Reviewing what you are approving

No approval asks for a decision on work it will not show. `lib/approvals/review.ts`
turns an approval into the thing it is about, and `GET /api/approvals/:id/review`
serves it — reading what is already stored, never calling a provider and never
regenerating anything, so reviewing a decision is free and does not change what
is being reviewed.

It is one system for every kind, not a component per domain. A resolver is three
facts — which payload key holds the ids, which table they are in, which column
reads as a title — and everything else is derived from the row: which fields
exist, what they are called, whether a value wants a line or a paragraph. Ids can
also point at a *parent*, so an approval carrying only `video_id` still shows the
thumbnail concepts hanging off it.

The important property is the fallback. When no resolver matches, the payload is
rendered as itself; when the rows are gone, the approval's own snapshot is used
and labelled as a snapshot. There is no path that produces an approval you cannot
read, which is the whole point — a summary like "found 5 opportunities" with no
way to see the five is not a decision, it is a rubber stamp.

### Ids are a uuid or null, never an empty string

`lib/db/validate.ts` checks every id-shaped field on every write, from both
stores, so the rule is the same in tests as in production. A relationship that
is genuinely absent is `null`; an empty string is a missing value pretending to
be a present one, and it is rejected with the column named rather than reaching
Postgres and coming back as `invalid input syntax for type uuid: ""`.

Required relationships — `business_id` is `not null` on every content table —
raise `MissingRelationship`, which the API answers as a 422 naming what is
missing. Optional ones go through `optionalId`, which returns a uuid or null and
nothing else. Columns that end in `id` but are somebody else's identifier
(`voice_id`, `external_id`) are listed as text and left alone.

### Getting JSON back from a model

`lib/integrations/ai/json.ts` is generous about packaging and strict about
content. Fenced blocks, unclosed fences, leading and trailing prose, and a brace
that appears in prose before the real object are all handled; a candidate only
counts once it actually parses. Zod then validates with no leniency at all —
loosening the schema to accept a half-written answer would put unfinished
research into the database looking finished, which is the one outcome worse
than failing.

Failures are categorised rather than collapsed into one sentence: `empty`,
`no_json`, `truncated`, `invalid_json`, `schema`. That distinction matters
because only truncation is fixed by more room; the rest need a better prompt.

Structured calls get an assistant `{` prefill, so the model cannot open with
"Here is the research you asked for", and a floor of 8,192 output tokens —
raised only upward, so an agent configured higher keeps its own figure. Where
the provider reports `stop_reason: max_tokens`, the single repair attempt is
given double the room *and* asked for a shorter answer, because more space alone
does not stop a model producing the same over-long reply.

The one-repair rule is unchanged: two calls at most, both billed and both
counted.

Diagnostics are logged for every structured attempt — provider, model, stop
reason, response length, content block types, max tokens and failure category.
Never the prompts, and never the key.

### Knowing which you are in

**Settings → System status** labels every service `CONNECTED`, `SIMULATED` or
`NOT CONNECTED`, with no fourth possibility and no ambiguity: Supabase, owner
login, Anthropic, web research, YouTube, Etsy, voice, images, video, stock media
and the renderer.

---

## How it works

### The agent execution engine

`lib/agents/engine.ts` holds the only path by which an agent runs. Nothing else
in the application calls an AI provider.

```
runAgent(store, ownerId, taskId)
  load task and agent
  check authority                → refuse rather than proceed
  mark task running, agent working, log activity
  build prompt from: system prompt + business context + agent memory
                     + task input + upstream step outputs
  call the provider
  validate against a Zod schema  → one repair attempt, then fail the task
  persist domain records
  record API usage and cost
  update agent statistics
  raise an approval if the step or handler requires one
  write the activity log
```

Adding an agent capability means adding a handler to
`lib/agents/capabilities.ts` — a schema, a prompt builder and a persist
function. The engine is never touched.

Handlers come in two modes, and **both** go through this one function:

| Mode | What it does | Example |
| --- | --- | --- |
| `ai` | Builds a prompt, calls the provider, validates with Zod, persists | Write a script |
| `provider` | Calls a media provider or the renderer through `run()` | Generate narration, assemble the video |

A `provider` handler skips prompt-building and token accounting — there is no
model call — but it still passes through authority checks, context and memory
loading, budget gates, cost tracking, task logging, activity logging and
approval handling. Real spend is returned as a `spend` field on the persist
result and recorded against the task that caused it. Nothing outside
`lib/agents/engine.ts` calls an AI provider: not a component, page, API route,
workflow file or YouTube module.

### The workflow engine

Workflows are data, not code. A definition
(`lib/workflows/definitions.ts`) lists steps, each naming a *capability* rather
than an agent, so replacing an agent does not invalidate a workflow.

`createMission` resolves each capability to a concrete agent, creates one task
per step, and records the dependency edges. `runMission` then loops: run what is
runnable, release what that unblocks, stop at an approval gate, a failure, or
the step ceiling. Mission status and progress are always *derived* from the
tasks — never set by hand.

### Approvals and authority

Two independent safeguards.

**Authority levels** bound what an agent may do unattended:

| Level | Meaning |
| --- | --- |
| 0 | Read only |
| 1 | Research and drafts |
| 2 | Modify internal data |
| 3 | External actions, each requiring approval |
| 4 | Explicitly authorised automation |

**Always-gated actions** stop regardless of level: spending money, purchasing,
publishing publicly, sending external messages, deleting important data and
changing account settings. They proceed only when the task carries an explicit
authorisation for that exact action *and* the agent is level 4.

An approval offers three outcomes. Approve completes the step. Reject cancels
it. Request changes re-queues the *same* task with the feedback attached, so
the agent tries again and the mission survives.

### Structured output

Every agent returns structured data validated with Zod (`schemas/`). If the
first response fails validation, the model is shown its own output and the
validation error and gets one repair attempt. If that also fails, the task is
marked failed and the error recorded. Corrupt data is never stored.

### Cost accounting

Every run writes an `api_usage` row: provider, model, token counts, estimated
cost, duration. Real spend also writes a `financial_transactions` row linked
back to the task that caused it, which is what makes questions like "how much
did Video #008 cost?" answerable rather than approximate.

---

## Accounts, roles and access

### Two modes, kept apart

| | Demo mode | Real account mode |
| --- | --- | --- |
| Trigger | No Supabase credentials | Both Supabase variables set |
| Storage | In-memory, reseeded on restart | Postgres with RLS |
| Sign-in | None — `/login` says so | Required; `/` redirects when signed out |
| Data | Every row carries `is_demo` | Never seeded |

Demo mode is not a lesser build — it is the same application on a different
storage driver, so local development never needs a database. It is also not
private, and Settings → Security says so plainly on any instance running
without Supabase.

### Roles

`lib/auth/permissions.ts` holds one table mapping role → permissions. Command
Centre is single-owner today; the other three roles are defined and enforced so
that adding a team member later is a data change rather than an audit of every
route.

| Role | Can |
| --- | --- |
| `owner` | Everything, including publishing and account/security settings |
| `admin` | Everything except publishing and account settings |
| `member` | Read the workspace and start missions |
| `viewer` | Read only |

Each role is a strict superset of the one below it, which is asserted in the
tests so a future edit cannot accidentally give a viewer more than a member.

### Where access is enforced

Three layers, none of which is "the button is hidden":

1. **Middleware** refreshes the session on every request and stops signed-out
   traffic — a redirect for pages, a `401` for `/api/*`, so a `fetch` gets a
   status it can act on rather than a page of HTML.
2. **Route handlers** call `withPermission(...)` or `guardPermission(...)` from
   `lib/auth/session.ts`. Both resolve the session and the role, and return
   `403` rather than doing the work. A forgotten check is a crash in
   development, not a silent hole.
3. **Row Level Security** is the backstop. Queries run as the signed-in user, so
   the *database* — not the application — is what stops one account reading
   another's. Migration `0003` closed two gaps found while auditing `0001`:
   `agent_memory` scoped only through its agent, so a row could name any
   business (memory is the one table where a leak crosses straight into another
   agent's prompt); and `task_dependencies` checked `task_id` but not
   `depends_on_task_id`.

Roles are additionally immutable from the client: a trigger rejects any update
to `profiles.role`, so even a valid session cannot promote itself.

### Account settings

**Settings → Account** shows display name, email, timezone, currency, the role
and exactly what it permits, and live session facts — sign-in method, last
sign-in, expiry. **Settings → Security** shows the posture of the running server
(storage, authentication, secret handling, simulation) and the password form.
Neither page ever prints a token, key or session identifier; changing your
password re-checks the current one first, because Supabase's `updateUser` does
not, and a borrowed unlocked laptop should not be enough to lock you out of your
own account.

---

## Custom agents

Agents are not only seeded by developers. **Agents → Create agent** opens a
builder that produces a real agent, with a real planet, running on the existing
engine.

### How templates work

`lib/agents/templates.ts` holds starting points — YouTube Researcher,
Scriptwriter, Fact Checker, SEO Analyst, Competitor Researcher, Islamic Content
Researcher, Islamic Source Checker, Pokémon Researcher, and a blank Custom
Agent. A template is
**prefill only**: choosing one fills the form, every field stays editable, and
what is saved is whatever was submitted. The server re-validates regardless of
which template was chosen. No template arrives above authority level 2 — an
agent that could spend or publish the moment it was created would be a trap.

### How capabilities map to handlers

A capability is a string that resolves to a handler in
`lib/agents/capabilities.ts`. The builder's picker is generated from that
registry (`lib/agents/catalogue.ts`), so it can only ever offer work the engine
can execute — and `POST /api/agents` re-checks, because the form is not a
security boundary. An agent carrying `totally.made.up` would fail every task it
was ever given, so it is refused with that reason.

Capabilities are grouped by prefix for display (YouTube, Islamic, Etsy,
General). A capability whose prefix nobody claims still appears, under *Other* —
adding a handler must never make it invisible to the builder.

### How to add a developer-level capability

1. Write a Zod schema in `schemas/`.
2. Add a handler — `capability`, `label`, `schema`, `buildPrompt`, `persist` —
   in `lib/agents/capabilities.ts` or a module registered from it.
3. Register it in the `HANDLERS` array.

It is now offered in the builder, assignable to any agent, usable in workflows
and nameable by the Commander. The engine is not touched. A `provider`-mode
handler implements `run()` instead of `buildPrompt`/`persist` — see
[the engine](#the-agent-execution-engine).

### How planets are created

`lib/agents/presets.ts` offers curated colour, size, ring and symbol presets —
not a colour picker. The galaxy is a designed system (gold is authority, greens
and teals are research, violets are language, oranges are visual work, blues are
production), and one free-form hex could destroy that legibility.

Orbit, angle and speed are **not** chosen by the operator: they are derived from
the agent's slot via a golden-angle spiral, so planets spread evenly however
many there are and never stack. Editing an existing agent's colour keeps its
orbit — a colour change should not teleport a planet across the galaxy. Status
colour still comes from `agent.status`; appearance never fakes activity.

### How authority works

Unchanged: the level bounds what an agent may do unattended, and the
always-gated actions stop regardless of level. The builder shows all five levels
with what each means, and says plainly that spending, publishing, messaging and
deleting always stop for approval.

### How custom instructions work

Stored on the agent and loaded into every run by the same engine, alongside the
business context, the agent's memory, the task and any upstream step outputs.
There is no second execution path for custom agents.

**Memory access** is new and defaults to `business`: an agent sees memory
recorded for the business it is currently working in, plus memory with no
business attached. Two channels under one account are different audiences with
different editorial rules, and carrying insight between them silently would be a
quiet, hard-to-notice failure. `none` runs an agent stateless; `agent` opts into
cross-business memory deliberately.

### Editing, duplicating, archiving

The agent page carries an Identity panel — name, role, business, type, memory
access, capabilities, appearance — plus **Duplicate** (copies how it works, not
what it has done; arrives disabled) and **Archive**.

**There is no delete.** Tasks, activity logs, costs and approvals all reference
an agent, so removing the row would leave missions whose history says "someone
did this". `DELETE /api/agents/[id]` returns `405` and says to archive instead.
An archived agent is never assigned new work and keeps every record it produced.

---

## Daily operations

The layer that makes this something you open every morning rather than a demo
you show people. It answers six questions from real records: what is working,
what is waiting, what needs you, what made money, what failed, and what to do
next.

### Needs you

`lib/operations/needs-you.ts` aggregates every pending approval, every failed
task, and every task with no agent that could ever run it. The rule it exists to
keep: **the number in the panel is the number of things that genuinely need a
person** — nothing invented to fill it, nothing left out. A panel that is wrong
in either direction stops being trusted, and then the operator checks everything
by hand anyway.

Each entry says what the decision is in plain language, and what happens on
approve and on reject. Approve/Reject appear inline where that is safe; a source
gate and a spend gate deliberately do not get a one-click Approve, because both
deserve reading.

### Today

Counted from records, and honest about gaps: `null` renders as `—`. A channel
with no analytics connection has *unknown* views, not nought, and the difference
matters when you are deciding whether something is working. Spend is always a
real number, because we record it ourselves.

### Work queue

`/queue` — every task across every business in Now / Next / Waiting / Needs
approval / Blocked / Done. The same state the galaxy shows, asked a different
way. Oldest-first within each bucket, because the oldest queued item is the one
most likely to be holding something up.

### Daily briefing and recommendations

Both run the Manager through `lib/agents/engine.ts` like any other agent — same
authority checks, memory, Zod validation, cost tracking and logging. The page
does not call a model; it creates a task.

What keeps them honest is `lib/operations/digest.ts`: the Manager is handed a
JSON digest of real state and told that anything not in it did not happen, that
numbers must match, and that `null` means unknown rather than zero. The schemas
give it nowhere to put a general impression — every recommendation must carry a
reason, an impact and a concrete action, and an empty list with a note is an
explicitly correct answer.

### Agent workload and performance

Workload is counted, not estimated: idle at 0 live tasks, light at 1, busy at
2–4, overloaded at 5+, with the thresholds stated in one place. Performance
shows completed, failed, success rate, average duration and cost — and says
plainly that these describe whether the agent *ran*, not whether its output was
good. Mixing operational metrics with content performance would let a busy agent
look like an effective one.

### Memory management

Memory rows now record who wrote them. An agent-written rule and an
operator-written rule read identically in a prompt but mean very different things
when you are working out why an agent behaved as it did, so every row is badged
`AI-generated memory` or `Owner memory`.

Memories can be searched, pinned (loaded first), edited, and archived. Deleting
is only offered for a memory nothing has used: once a memory has been loaded into
a run it is part of why an agent produced what it produced, and removing it would
quietly rewrite the explanation for work that already happened.

**High-importance rules an agent writes need approval.** "Never use background
music on this channel" silently rewrites every subsequent mission, so it lands
`pending` and raises a memory approval — and `loadRelevantMemory` refuses to load
anything pending. Deliberately narrow: gating every fact would produce a queue
nobody reads, which is the same as no gate at all.

### Mission priority and deadlines

Priority is `low`/`normal`/`high`/`critical`, defaulting to normal — everything
being high would mean nothing is. Deadlines are optional and **never inferred**;
they exist only because the operator set one or their instruction named a date.

Deadline status is deliberately crude and honest about it. There is no model of
how long a step takes — steps depend on providers, approvals and the operator's
own response time. So it answers only what state supports: has the date passed
(`overdue`), is the mission stopped with the date close (`at risk`), or is it
progressing (`on track`). It does not predict completion.

### Business switching and filtering

A switcher in the header filters the galaxy, queue, approvals and activity. It
is a *view* filter and nothing more: what agents can actually see is decided by
business assignment and memory scoping on the server. Filtering to a channel
highlights its own agents plus the shared ones — shared agents genuinely work on
it, and dimming them would suggest fewer hands than there are. No planet is
duplicated or hidden.

### Deployment safety

Demo mode is correct locally and dangerous in public. `isPubliclyExposedDemo`
shows a non-dismissible banner when there is no authentication, the build is
production, and the host is not local — and stays quiet on localhost, so the
banner that matters is never the one you have learned to ignore.
`Settings → System status` states what every service actually is.

---

## The YouTube production pipeline

A faceless video goes from a topic to a finished, watchable file without a
human touching an editor — and stops, visibly, at the two points where judgement
is actually required.

```
Idea → Research → Script → Fact check → ▶ SCRIPT APPROVAL
     → Voiceover → Visual plan → Assets → Thumbnail → Metadata
     → Assembly → Quality check → ▶ FINAL APPROVAL → Ready to publish
```

Both `▶` steps are real gates: the mission halts and waits. Approving the script
is what starts anything that costs money. Approving the final video sets the
video to `ready` — **it never publishes.** Uploading is a separate, explicit
action behind the YouTube Data API, and there is no code path that publishes on
its own.

`PRODUCTION_STAGES` in `types/production.ts` is the single definition of those
fourteen stages; the pipeline track, the videos board and the stage detail all
render from it.

### Media providers

`lib/integrations/providers/` follows the same rule as the platform
integrations: until credentials and an adapter both exist, the factory returns
an adapter that *throws*.

| Provider | Purpose | Without credentials |
| --- | --- | --- |
| Voice | Narration | Blocks the mission, naming `VOICE_PROVIDER` |
| Image | Scene stills and thumbnails | Blocks, naming `IMAGE_PROVIDER` |
| Video | Generated motion clips | Blocks, naming `VIDEO_PROVIDER` |
| Stock | Licensed footage and stills | Blocks, naming `STOCK_PROVIDER` |
| Renderer | Local ffmpeg assembly | Always available — no credentials, no spend |

A blocked step writes the reason onto the video and raises a
`provider_required` notification. It does not fail silently, and it does not
produce a placeholder pretending to be the real thing. In demo mode, and only
there, the missing providers are stood in for by clearly-marked simulations —
see [Simulated media](#simulated-media).

Every provider call runs server-side. Requests are checked *before* work starts,
so a mission does not spend on images and then discover the voice provider is
missing.

### Rendering

Assembly is real local compute, in `lib/integrations/providers/ffmpeg-renderer.ts`:
scene stills and clips scaled and cropped to 1920×1080, Ken Burns motion via
`zoompan`, crossfades via `xfade`, narration mixed with background music, and
burned-in captions and on-screen text. The bundled `ffmpeg-static` build has no
`drawtext` filter, so *all* text goes through `libass` — the renderer generates
ASS files and applies them with the `subtitles=` filter. Output is
`libx264` / `aac`, `yuv420p`, `+faststart`.

Scene durations are scaled to the *measured* narration length rather than the
planned estimate, and the finished file is probed rather than assumed — the
quality check reports what ffmpeg actually found.

### Budgets

`lib/finance/budgets.ts` gates every step that can spend, with three outcomes in
order of severity:

| Outcome | Behaviour |
| --- | --- |
| Over a category ceiling | **Blocked outright.** Approval cannot override it. |
| Over the approval threshold | Stops and raises a spend approval. |
| Within budget | Proceeds. |

Defaults per business are conservative — £25 per video, with £10 image, £12
video and £5 voice ceilings, a £5 approval threshold and concurrency 3 — and are
editable in the YouTube settings tab. Approving a spend gate re-queues that task
with an explicit authorisation for that one step; it does not become standing
permission.

### The job queue

Provider work runs through `lib/jobs/`, persisting a `provider_jobs` row per
call so a long render or a slow generation is observable, attributable and
costed rather than an opaque wait. The in-process implementation is the default;
the interface exists so a real worker can be dropped in without touching a
handler.

### Batches

"Create 3 YouTube videos this week" creates **three separate missions**, each
with its own tasks, approvals, budget and cost — not one mission producing three
videos. The Manager Agent caps a single instruction at ten.

---

## Islamic content

A specialised workforce for Islamic educational content, built on one premise:
**a religious claim is only as good as where it came from.** Provenance is a
first-class field everywhere, not an afterthought.

### The agents

| Template | Capabilities | Does |
| --- | --- | --- |
| Islamic Content Researcher | `islamic.research`, `islamic.content_plan` | Source-classified research packages and content plans |
| Islamic Source Checker | `islamic.source_verify`, `islamic.script_review` | Verifies citations, gradings and attributed positions |

Both run through `lib/agents/engine.ts` like every other agent — same authority
checks, memory, cost tracking, logging and approvals.

### Why nearly every field is nullable

Every reference, grading source, Arabic text and attribution in
`schemas/islamic.ts` is **nullable rather than optional**. A model asked for an
optional field will usually invent one to look complete; a model given an
explicit, legitimate way to say *"I do not reliably know this"* can take it. The
prompts say plainly that `null` is the correct answer when unsure, because a
null tells a human exactly what to check, while a plausible-looking citation
that turns out to be wrong gets repeated by an audience as religion and cannot
be taken back.

Hadith grading is an enum that **includes `unknown`** and is **required**, so
there is no way to return a hadith without saying something about its
authenticity, and no way to imply authenticity by omission.

### Source classification

Every religious claim is categorised: `QURAN`, `SAHIH_HADITH`, `OTHER_HADITH`,
`CLASSICAL_SCHOLAR`, `CONTEMPORARY_SCHOLAR`, `HISTORICAL_SOURCE`,
`GENERAL_CONTEXT`, `UNVERIFIED`. `UNVERIFIED` is a real answer and preferable to
a wrong one.

### Verification, and what blocks

The checker returns one status per finding: `VERIFIED`,
`ACCEPTABLE_WITH_CONTEXT`, `DIFFERENCE_OF_OPINION`, `NEEDS_SOURCE`,
`QUESTIONABLE`, `INCORRECT`.

Three outcomes, not two. The distinction that matters is between a **defect**
and an **unfinished job**:

| Status | Outcome |
| --- | --- |
| `VERIFIED` | Continue |
| `ACCEPTABLE_WITH_CONTEXT` | Continue with a note |
| `DIFFERENCE_OF_OPINION` | Continue *only* when the script actually says scholars differ |
| `NEEDS_SOURCE` | **Pause at a source resolution gate** |
| `QUESTIONABLE` | Block |
| `INCORRECT` | Block |

`INCORRECT` and `QUESTIONABLE` are the checker saying something is *wrong*, and
they stop everything. The verdict is computed from the findings rather than
taken from the model, so a cheerful summary next to an `INCORRECT` finding
cannot wave itself through.

`NEEDS_SOURCE` is the checker saying it could not *finish* — which is a task for
a person, not a failure. It pauses the mission at a resolution gate with five
real actions per claim: add a source, ask the Source Checker to research it
(a genuine task on a real agent), edit the claim, remove it, or override
deliberately.

**Override is a first-class, attributable act.** It records who, when and why,
it notifies, and it stays attached to the video through to the final quality
check — where it appears as a prominent warning at the moment of approval rather
than buried in a log nobody opens. It does not fail the video: the operator
already made that call on the record.

The gate will not close while any claim is unresolved. Approving it wholesale
would turn it into exactly the click-through it was designed to avoid, so every
claim must be settled first — and overriding is one of the ways to settle one.

Final QC for Islamic content reports Qur'an and hadith counts, unresolved
claims, questionable and incorrect findings, differences of opinion, and every
manual override. Unresolved `QUESTIONABLE` or `INCORRECT` findings fail it
outright.

### The workflow

```
Idea → ISLAMIC RESEARCH → SOURCE VERIFICATION → Script → ISLAMIC SCRIPT REVIEW
     → ▶ SCRIPT APPROVAL → Voiceover → Visual plan → Assets → Thumbnail
     → Assembly → QC → ▶ FINAL APPROVAL
```

Verification runs **before** the script, so a bad citation is caught while it is
one line in a package rather than woven into narration that has already been
recorded. Everything after script approval is the existing production pipeline,
unchanged — there is no second media pipeline.

Script approval is additionally gated: when a channel requires a source check,
`resolveApproval` refuses to approve a script that has none, or whose latest
check blocked. Enforced at the point of approval rather than by workflow
ordering, because an operator can approve from the approvals list, the galaxy or
the API, and an ordering does not survive a re-run or a hand-made mission.

### A channel of its own

An Islamic channel is a separate business, with its own agents, missions,
memory, analytics, videos, budget and visual style. When an account has more
than one business of a kind, a switcher in the workspace header chooses which is
in view (stored in an `httpOnly` cookie, validated against businesses you
actually own). Memory scoping is what keeps them genuinely separate.

### Source Policy

**YouTube → Source Policy**, per channel. Every setting is a choice with a
conservative default; **nothing encodes a madhhab, a school or a theological
position** — the application does not hold one. What it does encode is sourcing
discipline, which is a different thing.

- Require a Qur'an reference wherever a verse is used
- Require a grading on every hadith
- Require a source check before script approval
- Weak hadith: never / only with explicit labelling / allowed
- Require differences of opinion to be labelled
- Preferred Qur'an translation, Arabic display, methodology notes, disclaimer

### Visual restrictions

Per channel, and enforced twice. They reach the Visual Director and the Asset
Agent as hard constraints in the prompt, **and** the plan that comes back is
checked against them — a restriction that exists only as a request in a prompt
is not a restriction. A violating plan is not saved at all, so the Asset Agent
has nothing to pick up and no money is spent.

Defaults: no depiction of Prophets, no depiction of the divine, no generated
sacred text, calligraphy needs manual approval, faceless human depiction, no
background music.

### Arabic

Diffusion models render Arabic as convincing-looking nonsense — the shapes are
right, the letters are not — and a corrupted verse burned into a thumbnail is
both wrong and unrecoverable once published. So **Arabic never travels through
an image prompt.** `lib/islamic/arabic.ts` enforces that:

- Arabic characters in an image or video prompt are a visual-rule violation.
- Verified Arabic reaches the screen as *text*, from the structured record,
  through the same libass layer the captions use — with a font stack that can
  actually shape it, since the caption font has no Arabic coverage.
- Evidence with `arabic: null` renders **nothing**. Null means the agent did not
  reliably know the wording, and approximating it here would defeat the design.

### Command routing

The Manager routes to the Islamic specialists only when the subject matter is
genuinely Islamic *and* an agent with the capability exists *and* a channel
holds it. Any one of those missing falls back to the general routes: a Bronze
Age documentary does not need a religious source check, and sending it through
one would waste a step and pollute the Islamic channel's memory. This is
asserted in the tests in both directions.

---

## Pokémon research

One specialist agent, added on top of the existing workforce rather than beside
a second one. The **Pokémon Researcher** finds content opportunities and hands
them to the agents that were already there.

### What it does

| Capability | Does |
| --- | --- |
| `pokemon.research.ideas` | Content opportunities for faceless video — lore, mysteries, character and regional histories, legendary Pokémon, obscure facts, game and anime history, card history, collecting, competitive history, controversies, forgotten Pokémon, rankings, retrospectives |
| `pokemon.tcg.research` | Trading card topics: set history, rarity systems, print runs, notable cards, collecting culture, mechanics, set retrospectives |
| `pokemon.etsy.opportunities` | Product demand research, with intellectual-property risk assessed before a concept proceeds |

Every opportunity carries the same nine fields whatever kind it is: a title
concept, the hook as it would be spoken, a category, why someone would watch, who
specifically it is for, a suggested length, what must be researched first, the
researcher's own confidence, and whether it is evergreen or trend-driven. They
share one table, `pokemon_opportunities`, so the operator reads one ranked list
rather than three.

### Two things it will not do

**It does not invent market data.** Nothing here is connected to a live pricing
source, so a price, a valuation, a graded population, an auction result or a
claim about what is trending would be a number the agent made up — and an
invented price is exactly the kind of thing someone acts on before discovering it
was never real. Card *history* is knowledge and it answers freely; anything
needing current market data is recorded with `requires_live_data` set and the
missing source named in plain words. The check runs over what the model returned,
not merely as an instruction in the prompt, because the case worth catching is
the one where it was told not to and did anyway.

**It does not confuse demand with permission.** Researching what people want is
ordinary research and is reported honestly, including where the demand is for
protected material. Whether we may *sell* something is a separate question with a
different answer: almost always no, wherever a product would reproduce artwork,
characters, card faces, logos or branding belonging to Nintendo, Game Freak,
Creatures Inc. or The Pokémon Company. `lib/pokemon/policy.ts` assesses every
product concept from its own text — not from the risk the model claimed — and a
concept at `high` or `blocked` raises an approval naming what is protected and an
original direction that keeps the buyer and drops the risk. A fan-art redraw is
not treated as a way around it, because it is not one.

### Handoffs

The `pokemon_youtube_video` workflow is the ordinary faceless pipeline with one
step swapped:

```
Pokémon Researcher → Scriptwriter → Fact Checker → [approve script]
  → Voiceover Agent → Visual Director → Asset Agent
  → Thumbnail Strategist → Video Producer → Quality Control → [approve video]
```

Only the first step is new; every step after it is the existing workflow run by
the existing agents, and no agent is duplicated. The handoffs are real
`handoff` activity logs, so they draw the same craft between planets in the
galaxy as any other handoff. The script approval gate is unchanged — no
production work and no spending until the operator has approved.

### Command routing

The router recognises Pokémon work and sends it to the specialist, ahead of the
general YouTube and Etsy routes:

| Instruction | Goes to |
| --- | --- |
| "Give me 10 Pokémon YouTube ideas." | `pokemon.research.ideas` |
| "Research the history of Charizard cards." | `pokemon.tcg.research` |
| "Find interesting Pokémon mysteries for YouTube." | `pokemon.research.ideas` |
| "Create a faceless video about the strangest Pokémon lore." | `pokemon_youtube_video` |
| "Find Pokémon TCG topics that could make good videos." | `pokemon.tcg.research` |
| "Are there Etsy product opportunities around Pokémon?" | `pokemon.etsy.opportunities` |

Routing is gated on subject *and* capability, the same way the Islamic routes
are. A Magic: The Gathering question is not claimed, a general YouTube request
still reaches the general researcher, an analytics question still reaches the
Analyst, and removing the agent removes its routes with it rather than leaving
missions nobody can run.

### The planet

Electric lime with a pale halo and a ring — original, energetic and
collectible-feeling, and deliberately nothing to do with any protected artwork
or logo. It is a distinct colour in the designed system (`voltage`, meaning
collectible and franchise research) so the Builder can offer it too, and it
appears in the galaxy the same way every other agent does.

### Room for more

The `pokemon.*` namespace is the extension point. A Pokémon Card Analyst would
add `pokemon.card.*`, a Trend Scout `pokemon.trends.*`, an Etsy Product
Researcher `pokemon.product.*` — each a handler appended to
`lib/agents/pokemon/index.ts`, picked up by any agent that declares the
capability, reachable from the same route table. **None of those exist yet**,
and adding one would touch neither the engine, the workflows nor the galaxy.

---

## Galaxy architecture

Built with React Three Fiber, loaded only in the browser and only after a WebGL
check. `components/galaxy/`:

| File | Responsibility |
| --- | --- |
| `Galaxy.tsx` | Entry point: device detection, hover card, view controls, mobile and no-WebGL fallbacks |
| `GalaxyScene.tsx` | The scene, the viewport-filling camera, gentle focus and orbit controls |
| `layout.ts` | Where planets sit and how fast they move — presentation only, never stored |
| `Planet.tsx` | One agent — orbit, spin, surface, atmosphere, status glow, attention ring, label |
| `CommandCore.tsx` | The star at the centre; breathes slowly, quickens while a command is running |
| `Rockets.tsx` | Handoff craft, flown from recent `handoff` activity logs |
| `flights.ts` | When a handoff is worth flying and when the next craft may leave |
| `Starfield.tsx` | Background stars and orbit paths |
| `MobileGalaxy.tsx` | A simplified SVG system for small screens |
| `quality.ts` | Device capability detection and quality tiers |
| `textures.ts` | Procedural planet surfaces and glow sprites, generated once and cached |
| `hash.ts` | Turns an agent id into a stable appearance |

**Everything visible is bound to state.** Glow comes from `agent.status`. The
amber ring appears only while an approval is pending. A craft flies only when a
real `handoff` log is recent — there is no idle traffic and no decorative
flight, so the galaxy never shows work moving that did not move.

**Layout is presentation, not data.** `agent.visual` is the operator's choice —
colour, relative size, whether it has a ring. `layout.ts` turns that into the
geometry the scene renders: agents are dealt evenly onto at most five orbits so
the outer edge is never one lonely planet a long way from everything, planets are
drawn about half again their stored radius, and every planet on a ring shares one
orbital speed so ring-mates hold their spacing forever. Change these numbers and
only the picture changes.

**Camera.** The resting position is computed from the system's actual size and
the shape of the viewport, never hard-coded. Seen from above the ecliptic a disc
does not project to a centred ellipse — its near edge looms larger than its far
edge — so the aim point is nudged towards the near edge until both reaches match
and the distance is solved against that. Clicking a planet is a push-in to about
three-quarters of the resting distance, not a close-up: the system stays in
frame, and the camera then tracks the planet as it orbits without overriding
whatever angle or zoom the operator chose.

**Handoff craft.** A small self-illuminated vessel in the sender's colour follows
a curved path from the sending planet to the receiving one over about five and a
half seconds, easing away and settling on arrival, then fades. Bursts are queued
rather than fired together: at most three in the air at once and never two
launches inside a beat, so six simultaneous handoffs leave as a spaced convoy.
The launch point is captured once so the craft leaves from where the sender
actually was; the destination is read live so it lands on the receiver rather
than where the receiver used to be.

**Labels.** Every planet carries its name and status as DOM text over the canvas,
so both stay sharp and constant in size however far the camera is. That is all
the default view shows; role, business and current task wait for hover, and
everything else waits for selection. Selecting a planet enlarges it, rings it and
pushes the rest into the background by darkening rather than by transparency — a
half-transparent planet shows the starfield through itself and stops reading as a
solid world.

**Performance.** Three quality tiers are chosen from pointer type, viewport,
core count and reported memory. Touch devices and narrow viewports always get
the cheap profile, which drops the per-planet labels and allows one craft in the
air at a time. Textures are generated once per colour and surface pattern and
shared; nothing in the scene allocates per frame.

**Reduced motion.** With `prefers-reduced-motion: reduce`, orbital movement,
rotation, pulses and handoff craft stop. State is still fully conveyed by colour,
ring, label and text.

**Accessibility.** The galaxy is never the only way to do anything. Every agent,
task, mission and approval is reachable through the sidebar as a list or table.
Without WebGL, the universe page renders a keyboard-navigable agent list.

---

## The AI YouTube Studio

One workflow. One mission engine. One set of capabilities. **The only thing that
changes between a demo and a real studio is which implementation answers each
provider call.**

That is not a description of an intention — `tests/modes.test.ts` builds the
task graph in demo mode and in production mode and asserts the two are `toEqual`
identical: same steps, same order, same dependencies, same approval gates, same
capabilities. It also asserts that no workflow definition anywhere names a
provider, and that no workflow key looks like a fork (`*_demo`, `*_v2`).

### Modes

| Mode | Database | Model | Media providers | Billable |
| --- | --- | --- | --- | --- |
| `demo` | in-memory | mock | simulated | no |
| `development` | Supabase | Anthropic | simulated unless configured | model calls only |
| `production` | Supabase | Anthropic | real, or the step blocks | yes |

Inferred by default — no database means a demo, a database means production —
and overridable with `COMMAND_CENTRE_MODE` for the one case inference cannot
see: a developer who wants real Claude and a real database without paying for
narration and rendering on every run. One override is refused: a workspace with
a database cannot call itself a demo, because that would put simulated output
into real records.

### The pipeline

```
research → script → fact check → ⟨SCRIPT APPROVAL⟩ → voiceover plan → voiceover
        → visual plan → assets ┐
        thumbnail concepts → thumbnail images ┤
        metadata ──────────────┴→ assembly → subtitles
                                  assets  → copyright review
                        → quality check → ⟨FINAL APPROVAL⟩ → publish → analytics
```

Sixteen steps, two operator gates, one definition. The copyright review blocks
the pipeline itself when it finds something that cannot ship, and publishing
refuses unless the video is approved, the copyright review cleared and a real
publisher is connected.

### The provider layer

Nine interfaces in `lib/integrations/providers/types.ts`: `VoiceProvider`,
`MusicProvider`, `ImageProvider`, `VideoProvider`, `StockMediaProvider`,
`SubtitleProvider`, `VideoRenderer`, `Publisher`, `AnalyticsProvider`. Each has
a simulated implementation and an unconnected one, resolved through
`registry.ts` by mode.

An unconnected provider **throws**. It never returns a placeholder, so a step
that needs one blocks with the exact environment variables required to fix it.
Two refusals are deliberately sharper than the rest:

- The **simulated publisher** returns an id shaped `simulated-…` and a URL that
  goes nowhere, and `published_external_id` is only ever written by a genuine
  upload. A demo can never leave the workspace believing a video is live.
- The **simulated analytics provider** returns nothing at all. Every other
  simulated provider fabricates structure; this one would have to fabricate
  *results*, and those flow into Business Intelligence Memory and from there
  into every future prompt.

### Adding a provider

```ts
// lib/integrations/providers/elevenlabs.ts
export class ElevenLabsVoiceProvider implements VoiceProvider { … }

// registry.ts — one line
export function getVoiceProvider(): VoiceProvider {
  if (envPresent(VOICE_ENV)) return new ElevenLabsVoiceProvider();
  if (simulationAllowed()) return new SimulatedVoiceProvider();
  return new UnconnectedVoiceProvider(VOICE_ENV);
}
```

No workflow changes. No capability changes. No engine changes.

### Upload package

`GET /api/youtube/videos/<id>/package` assembles the MP4, thumbnail, captions,
title, description, tags, chapters, pinned comment, transcript, sources, licence
report and AI cost report from stored records — with `?format=markdown` for a
single downloadable document. It also returns `blockers`: the list of things
that must be true before Publish means anything.

Nothing is invented. A section with no underlying record says so rather than
being omitted, because a missing licence report and an empty one mean very
different things to whoever signs off the upload.

---

## Connecting real providers

Four real adapters are implemented. Each is **off until you configure it**, and
each stays honestly *not connected* rather than pretending.

### What is implemented

| Provider | Adapter | Account needed | Cost |
| --- | --- | --- | --- |
| Voice | ElevenLabs | elevenlabs.io | Per character (~£2–3 per 12-minute video) |
| Images | OpenAI Images | platform.openai.com | Per image (~£0.035 each) |
| Stock media | Openverse | none | **Free** |
| Publishing | YouTube Data API | Google Cloud + your channel | Free (daily quota) |
| Analytics | YouTube Analytics API | same as publishing | Free |

### Environment variables

Add these to `.env.local`. **Never paste a key into a chat, a commit or an
issue.** Nothing here is prefixed `NEXT_PUBLIC_`, so none of it reaches the
browser.

```bash
# Narration
VOICE_PROVIDER=elevenlabs
VOICE_PROVIDER_API_KEY=...
VOICE_ID=...                      # from your ElevenLabs voice library
VOICE_MODEL=eleven_multilingual_v2 # optional

# Images
IMAGE_PROVIDER=openai
IMAGE_PROVIDER_API_KEY=sk-...
IMAGE_MODEL=gpt-image-1            # optional

# Stock media — no key, just name it
STOCK_PROVIDER=openverse

# YouTube publishing and analytics
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_CATEGORY_ID=27             # optional; 27 is Education
```

The YouTube refresh token is obtained once through Google's OAuth consent
screen with the `youtube.upload`, `youtube.readonly` and
`yt-analytics.readonly` scopes. It is stored server-side only.

### Safety properties

- **Demo Mode never spends**, even with every key set. The registry checks the
  mode *before* the credentials, so a stray key on a developer machine cannot
  bill anyone for running the demo.
- **Testing a connection never generates anything.** Each test uses the
  provider's cheapest free call — read the subscription, list models, name the
  channel. Opening Settings costs nothing.
- **Keys never leave the server.** Provider descriptors sent to the browser name
  the *variables* required, never their values, and `redact()` scrubs anything
  key-shaped out of every error before it reaches a database row or a screen.
- **Uploads default to private** and are never retried automatically — a
  retried upload is a duplicate video.
- **Revenue and impressions are never invented.** The analytics adapter requests
  only what the API genuinely returns for a channel owner.
- **Production Mode rejects simulated media.** If any asset in a real mission
  came from a simulated provider, quality control fails with a blocking issue.

---

## Studio: render, captions, licences

### The renderer

One renderer, strengthened rather than replaced: local ffmpeg, 1920×1080, 30fps,
H.264 video and AAC audio, `+faststart` for streaming. Stills get a slight Ken
Burns move, scenes crossfade or cut, narration and music are mixed, and captions
can be burned in.

Three presets — `draft` (ultrafast/CRF 28), `standard` (the default) and `high`
(slow/CRF 18) — chosen per channel and reported in the final review, so a draft
can never be mistaken for a master.

**A twelve-minute narration produces a twelve-minute video.** Scene durations
are scaled proportionally to the *measured* narration length, so a shot the
visual director wanted held stays longer than one it wanted to pass through.
`validateTimeline` then refuses to spend an encode on a timeline that would
produce black: pictures ending before the voice does is blocking, a gap between
scenes is blocking, a scene with no asset is blocking.

An opt-in smoke test renders a real MP4 from local fixtures and checks it with a
probe — no paid provider, no credentials:

```bash
RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
```

It found a genuine bug on its first run: `fps` was applied *before* `zoompan`,
and since zoompan generates `d` frames from every *input* frame, a four-second
still became eight minutes and the encode produced nothing at all. Stills with
motion are now fed as a single frame with the filter owning the duration.

### Captions

Both SRT and VTT, from the same cues. Where the voice provider returns word
timings they are used as-is; otherwise cues are estimated from the script and
then **fitted to the measured narration length**, which removes the drift that
otherwise accumulates line by line. `aligned` records which happened, and the
review says so rather than claiming a sync nobody measured.

`validateCues` rejects overlaps, empty cues, cues that run past the audio, and
lines too long to read.

### Provenance and licences

Every visual asset is classified deterministically from what was *recorded*
about it — never by asking a model, which can be argued into "probably fine".
The default is `unresolved`, and `unresolved` blocks.

| Provenance | Effect |
| --- | --- |
| `generated_original` | Allowed, subject to the provider's terms |
| `owner_uploaded` | Allowed; the rights responsibility is stated as yours |
| `public_domain` | Allowed, source retained |
| `licensed_stock` | Allowed, licence and attribution retained |
| `permitted_archive` | Allowed, source retained |
| `fair_use_review_required` | **You** decide before publishing |
| `unresolved` | **Blocks** |

An image generated from a prompt naming protected property — Charizard,
Nintendo, a franchise logo — is `fair_use_review_required`, not
`generated_original`: an original rendering of a trademarked character is still
that character. A permissive licence on a *photograph of* a card does not
license the card, so that is flagged too.

The system never states that anything is legally safe. `GET
/api/youtube/videos/<id>/licence` returns the full report (`?format=markdown` to
download) and carries that disclaimer in the document itself.

### The studio review

`/youtube/studio/<approvalId>` — the video playing inline, the selected and
alternative thumbnails, the metadata that would be published, the caption track,
every asset's licence, the quality report, and the cost broken down by provider.

**Approving is disabled until the video can actually be played.** Approving a
video you have not watched is not a decision.

---

## Approvals: the editorial review

One rule shapes this whole area: **an operator is never asked to approve work
they cannot fully inspect.** A script approval that shows "1 claim checked, 1
warning" above a button that starts production and opens a budget is a receipt,
not a review.

So every approval is assembled into a *dossier* — a summary you can scan, panels
you can read, and actions whose consequences are spelled out. Those are the three
parts every approval registers, and they are declared as **data** rather than as
components, which is what lets a business added in a year's time inherit the
entire review screen without anyone writing one.

### The shape

`lib/approvals/dossier/types.ts` defines a closed set of *presentation* shapes:

| Panel | What it renders | Used by |
| --- | --- | --- |
| `document` | Prose, set as a document: measure, line height, scene headings | Scripts, research reports |
| `claims` | Assertions split into verified and warnings, each with its reason | Fact checks, source checks |
| `sources` | Citations grouped by kind of evidence, with reliability | Anything researched |
| `scores` | Measured quality, each with the sentence saying what it measured | Scripts |
| `scenes` | The storyboard the narration implies | Scripts |
| `versions` | Draft history with a word-level diff and approval history | Anything revisable |
| `media` | Images, video and audio played in place | Thumbnails, renders, narration |
| `ledger` | Money, with ceilings and headroom | Spend gates |
| `items` | Stored rows as cards — the generic renderer | Everything else |
| `fields` | The payload as readable fields — the floor | Anything unrecognised |

A builder answers one question — "given this approval, what should the operator
read?" — and returns panels. It renders nothing and cannot break another kind's
screen.

### Registering a reviewer

```ts
// lib/approvals/dossier/index.ts
registerDossier({
  id: 'my_business',
  kinds: ['listing'],
  async build({ store, approval }) {
    const row = await store.get('my_table', approval.payload.thing_id);
    if (!row) return null;              // fall through to the generic reviewer
    return {
      summary: { title: row.name, metrics: [{ label: 'Price', value: `£${row.price}` }] },
      panels: [{ kind: 'document', id: 'copy', title: 'The listing', blocks: [...] }],
      approveConsequence: 'Approving marks it ready. Publishing is separate.',
    };
  },
});
```

Registering nothing is also a complete answer. `genericDossier` resolves
whatever the payload points at — rows in any table, arrays embedded in the
payload, or the payload itself — and shows all of it. A specific builder makes a
review *better*; it never makes one possible.

### Honesty rules

- **Quality scores are measured, never guessed.** Where there is nothing to
  measure — originality with no history behind it, SEO with no metadata written
  yet — the score is `null` and the band is `unknown`. The overall figure
  excludes them rather than assuming a value.
- **Nothing predicts audience behaviour.** "Retention prediction" scores the
  structural devices that hold attention and says so in its basis line. Real
  retention comes from analytics.
- **Sources are described, not judged.** A community wiki is "unverified", not
  "wrong". Reliability describes what a publisher *is*.
- **Storyboards are suggestions.** No footage is sourced, generated or reserved.
  A scene with nothing concrete to cut to is reported as a note about the
  writing.
- **Nothing costs money.** Building a review reads stored rows only. No provider
  is called, and reading an approval twice shows the same thing twice.

### Request changes

`lib/approvals/presets.ts` replaces the blank textbox with the notes an editor
actually gives, grouped and composable. Several presets plus a sentence of your
own become one numbered brief, shown in full before it is sent.

The brief then goes to the agent that can act on it. `lib/approvals/rework.ts`
maps an approval kind to the capability that redoes the work — `script` →
`youtube.script.revise` — inserts that task, and makes the step that raised the
approval wait behind it. The sequence an editor expects follows: notes →
rewrite → re-check → review again, with every draft kept as a version.

Where no rework capability exists, or no agent in the workspace provides it, the
previous behaviour stands exactly as it was: the same step is re-queued with the
feedback attached. Rework can make a request better; it can never strand a
mission.

### Version history

`youtube_script_versions` already stored every draft; the review now reads them
back. Consecutive pairs are diffed section by section (matched on heading, so a
moved section is not one enormous deletion), and within a section word by word
via an LCS in `lib/approvals/diff.ts`. Whitespace rides on the token it follows,
so the "after" column reads as the script rather than as fragments.

### Export

- **Markdown** — the document as written.
- **Word** — a real `.docx`. `lib/approvals/export.ts` writes valid OOXML into a
  stored zip with correct CRC32s, so it opens without a warning dialog.
- **PDF** — the browser's own print-to-PDF, with a print stylesheet in
  `app/globals.css` that turns the page into a document.

---

## Resolving the canonical script

A mission failed at its revision step with "No script was supplied to revise",
while the approval screen reported that the original records were gone. Both
messages were misleading. **Nothing in Command Centre deletes scripts** — there
is no `remove` call against `youtube_scripts` anywhere in the codebase, RLS uses
the same expression for `using` and `with check` so a row it let you write is a
row it lets you read, and retry only touches failed steps.

The script was never *found*. Every step resolved it for itself from ambient
context, and each one failed differently and quietly:

| Step | On a miss | Consequence |
| --- | --- | --- |
| Fact check | substituted the string `(script unavailable)` | produced a real fact-check row and a real approval for a script it never read — hence "1 claim checked" |
| Revise | threw "No script was supplied to revise" | one message for two unrelated faults: nothing supplied, versus supplied but not found |
| Approval review | fell back to the payload snapshot | told the operator the records were gone |

So the visible symptom appeared two steps after the fault, pointing at the wrong
thing entirely.

### One resolver

`lib/workflows/script-resolution.ts` is now the only code allowed to answer
"which script is this mission working on?". It tries, in order:

1. `task.input.script_id` — what the step was explicitly handed.
2. **Any** earlier step's output, not just the one keyed `script`. A rework step
   writes its own key and is the newer draft.
3. The id inside the script approval — following the pointer, which is not the
   same as reading the snapshot.
4. The mission's own tasks, joined to `youtube_scripts.task_id`. The mission owns
   its scripts whether or not any reference to them survived.

Ids are validated as uuids first, so an empty string is never queried with.

### The archive layer

If a candidate id has no head row, the resolver rebuilds it from
`youtube_script_versions` — append-only, written by exactly two steps, and the
most durable record of the work in the system. The rebuilt row is written back
so the next step finds a row rather than repeating the rebuild, and
`restoredFromArchive` reports that it happened.

### Failing loudly

When nothing resolves, `ScriptUnavailable` names every source it tried, the id it
considered, and what it found. A verification step with nothing to verify now
fails instead of verifying a placeholder.

### Tracing a mission

`GET /api/missions/<id>/trace` returns the mission graph edge by edge: for every
step, its input ids, output ids and approval payload ids, each checked against
the database. It separates the three causes that look identical from the outside
— the row was removed, the row was never written, the id was never valid — and
lists every script the mission owns, found by walking its tasks rather than by
following references, so a script nothing points at still appears.

### Why AI-planned missions failed and workflow-defined ones did not

The script existed, the approval read it back, and the revision step still could
not see it. The cause was two lines in the executor:

```ts
const stepKey = step.key ?? step.capability.split('.').pop();   // engine.ts
const fromStep = ctx.previousOutputs.script?.script_id;          // capabilities.ts
```

A mission built from a **workflow definition** sets `key: 'script'` by hand, so
the second line found it. A mission planned by the **Manager** takes its steps
from a model, sets no key, and derives one from the capability — so the script
step was keyed `write`, the fact check `factcheck`, and the revision `revise`.
Nothing was keyed `script`, so the lookup missed in *every* AI-planned mission.
Every test in this repo built missions from workflow definitions, which is
exactly why nothing caught it.

The derived key was also not unique: `youtube.voiceover.generate` and
`youtube.thumbnail.generate` both reduced to `generate`, as did
`youtube.research.ideas` and `pokemon.research.ideas`. Step keys index
`loadPreviousOutputs` and `workflow_runs.step_tasks`, both plain objects, so a
collision silently discarded one step's output — a mission planned with both
narration and thumbnail generation lost one of them from its own graph.

`assignStepKeys` now derives from the whole capability and de-duplicates within
a mission, `loadPreviousOutputs` orders by completion time so later work wins
deterministically, and the resolver picks the **newest** script when several
steps name one — which is what makes the revision step receive the approved
version rather than the draft it superseded.

### Two related fixes found on the way

- **`getStore()` no longer substitutes demo data.** With Supabase configured and
  no readable session it used to silently return the seeded in-memory store
  under a demo owner id. Every read then came back null with no error — which is
  indistinguishable from the records having been deleted. It now throws
  `NotSignedIn`, and routes answer 401.
- **Approving no longer depends on the script row existing.** `applyDomainEffects`
  updated `youtube_scripts` unguarded, so a missing row meant the operator could
  not record a decision at all. It resolves through the archive now, and if the
  script genuinely cannot be found the decision is still recorded.

---

## Business Intelligence Memory

Two kinds of memory now exist and they are deliberately different:

- `agent_memory` holds **rules**. An agent proposed one, an operator approved it,
  and it shapes every later run. It is opinion that someone signed off.
- `mission_outcomes` holds **outcomes**. Nobody had to agree to them; they
  happened. What was made, what it cost, how long it took, and once the numbers
  exist, how it actually did.

### How it fills

`recordMissionOutcome` runs the moment a mission reaches `completed` — from the
runner and from approval resolution, because a mission that ends on an approval
never passes through the runner. It is idempotent by mission, and migration 0007
enforces that with a unique index, so a re-run cannot count the same video twice
in every average the agents later read.

Performance is **pulled, not pushed**. Analytics arrive from a provider on their
own schedule, long after the mission ended, so `businessOutcomes` reads them at
brief time and writes what it finds back to the row. A sync hook that had to
remember to update outcomes would eventually forget.

Every performance column starts null and stays null until a real analytics row
fills it. A mission completing is not an audience watching, and a workspace that
seeds plausible numbers teaches its own agents to be confident about fiction.

### How agents use it

`businessMemoryBrief` renders the business's own history as a short block, and
the engine puts it on `RunContext.businessMemory`. `baseContext` renders it once,
so **every** capability — including capabilities that do not exist yet — gets it
without anyone wiring it in per handler.

It is scoped per business, so a YouTube channel's history never reaches an Etsy
agent's prompt and two channels under one account stay separate. Each business
accumulates its own knowledge because each one is a different audience. And it is
bounded, so a workspace with a thousand finished missions costs the same per
prompt as one with ten.

The brief is explicit about what is not known:

```
What this business has learned from its own completed work:
- 3 completed pieces of work so far.
- Already covered — do not repeat these unless asked: The banned episode; …
- No audience or sales figures are known yet for any of it. Do not assume any
  of the above performed well or badly.
- Cost so far: £0.60 across 3, averaging £0.20 each and 62 minutes each.
Use this as evidence, not as instruction.
```

---

## Extending it

### Add an agent

Insert a row in `agents` (or add it to `lib/db/seed.ts`) with a `capabilities`
array and a `visual` block:

```ts
{
  name: 'Newsletter Writer',
  slug: 'newsletter-writer',
  capabilities: ['newsletter.draft'],
  authority_level: 1,
  visual: {
    colour: '#f472b6', atmosphere: '#fbcfe8',
    radius: 0.6, orbit: 7.8, angle: 1.2,
    speed: 0.028, inclination: 0.1, roughness: 0.5,
  },
}
```

The planet appears on the next poll. Keep colours inside the existing system —
warm golds for authority, greens and teals for research, violets for language
work, oranges for visual work, blues for production and measurement.

### Add a capability

Add a handler to `lib/agents/capabilities.ts`:

```ts
const newsletterDraft: CapabilityHandler<z.infer<typeof newsletterSchema>> = {
  capability: 'newsletter.draft',
  label: 'Draft newsletter',
  schemaName: 'Newsletter',
  schema: newsletterSchema,
  async buildPrompt(ctx) { /* ctx has store, agent, task, business, memory */ },
  async persist(ctx, data) {
    // Store rows, return a one-line summary and optionally an approval.
    return { summary: 'drafted this week’s newsletter', output: { id } };
  },
};
```

Register it in the `HANDLERS` array. It is now usable by any agent, workflow
step or Commander plan.

### Add a business

Insert a row in `businesses` with a `kind`. Workspaces resolve their business by
kind (`lib/db/workspace.ts`), so a second YouTube channel needs no code change.
A new *type* of business needs a `kind`, a workspace route and a tab list.

### Create a workflow

Add a definition to `lib/workflows/definitions.ts`. Steps reference
capabilities and declare dependencies by step key:

```ts
{
  key: 'newsletter_weekly',
  name: 'Weekly Newsletter',
  steps: [
    { key: 'research', title: 'Gather stories', capability: 'seo.keywords',
      depends_on: [], requires_approval: false },
    { key: 'draft', title: 'Draft newsletter', capability: 'newsletter.draft',
      depends_on: ['research'], requires_approval: true,
      approval_label: 'Approve newsletter' },
  ],
}
```

### Add an integration

Interfaces live in `lib/integrations/`. Implement the relevant one and return it
from its factory. Until credentials exist, the factory returns an adapter that
*throws* rather than returning a placeholder — an asset that does not exist must
never look like one that does. Register the required environment variables in
`lib/integrations/registry.ts` so Settings reports the connection state honestly.

### Add a media provider

Implement the interface in `lib/integrations/providers/types.ts` — voice, image,
video or stock — and return it from its getter in
`lib/integrations/providers/registry.ts` when the credentials are present. The
getter's contract is deliberately strict: credentials but no adapter *throws*,
rather than quietly degrading. Report a real per-call cost from the adapter so
the budget gates and the per-video cost breakdown stay accurate, and implement
`isConnected()` as a genuine cheapest-possible round trip — Settings' "Test
connection" calls it directly rather than inferring from the environment.

---

## Testing

```bash
npm test
```

Covers the parts where being wrong is expensive:

- **Structured output** — JSON extraction from prose and fenced blocks, schema
  validation, no partial data on failure, and that the simulated provider
  produces genuinely schema-valid output for every schema.
- **Authority** — that no authority level can spend, publish, message or delete
  unattended, and that an authorisation for one action never carries to another.
- **Workflow progression** — dependency release, downstream cancellation on
  failure, capability resolution, mission numbering, the step ceiling.
- **Agent execution** — end-to-end runs, usage recording, statistics, failure
  handling for disabled agents and insufficient authority.
- **Approvals** — approve, reject and request-changes outcomes, double-resolution
  refusal, and the domain effects of each.
- **Mission status** — that status and progress are derived correctly from tasks.
- **Finance** — summaries, windowing, per-business scoping, agent economics.
- **Production** — the script gate genuinely holding production back, the full
  demo-mode pipeline running through to a real rendered file with measured
  quality-check facts, and a final approval that reaches *ready* without
  publishing.
- **Honest failure** — that in real mode a missing voice provider stops the
  mission, names what is missing, and creates no voiceover asset.
- **Budgets** — category ceilings that approval cannot override, thresholds that
  stop for the operator, and spend approvals that re-queue rather than complete.
- **Roles and permissions** — that the owner has everything, that publishing and
  account settings stay with the owner alone, that a viewer can change nothing,
  and that each role is a strict superset of the one below.
- **Agent creation** — that the factory fills every field, that slugs never
  collide, that planets never share an orbit slot, and that a capability with no
  handler is refused rather than producing an agent that fails every task.
- **Templates** — that every template offers only real capabilities and none
  arrives above drafting authority.
- **Memory isolation** — that one channel's learned preferences never reach
  another channel's prompt, and that archived agents are never assigned work.
- **Islamic schemas** — that null is expressible for every reference, that a
  hadith cannot be returned without a grading, and that the status enum is
  closed.
- **Source checking** — that INCORRECT and QUESTIONABLE block, that NEEDS_SOURCE
  does not, and that the verdict is computed from the findings rather than taken
  from the model.
- **Approval gating** — that a channel requiring a source check refuses to
  approve a script without one, refuses when the latest check blocked, and
  allows once a later check passes.
- **Visual restrictions** — that a prompt asking to depict a Prophet or to
  generate Arabic is caught, that ordinary imagery is left alone, and that a
  violating plan saves no scenes.
- **Arabic** — that unverified wording renders nothing and verified wording gets
  a font that can shape it.
- **Routing** — that Islamic instructions reach the Islamic channel and ordinary
  YouTube instructions do not.
- **Needs-you aggregation** — that the count equals exactly the things that need
  a person: pending approvals, failed tasks and tasks nobody can run, and not
  resolved approvals, running tasks or failures in cancelled missions.
- **Source resolution** — that NEEDS_SOURCE raises a gate rather than failing,
  that the gate refuses to close with a claim unresolved, that an override
  records who/when/why, and that overrides warn at QC while unresolved claims
  fail it.
- **Memory approval** — that durable agent-written rules gate and ordinary facts
  do not, that a pending rule is never loaded into a run, that rejection
  archives rather than deletes, and that pinned memories load first.
- **Operations** — deterministic workload bands, today counting only today,
  `null` for unknown rather than zero, deadline states that never predict, and
  quick commands that name only things that exist.
- **Deployment safety** — that the public-demo banner fires on a real deployment
  with no authentication and stays quiet locally.
- **Galaxy layout** — that every agent gets exactly one planet, that orbits are
  filled evenly rather than leaving an outer straggler, that ring-mates are spaced
  apart and share one speed so they never converge, that every orbit is slow
  enough to read as calm, and that an agent's appearance is identical on every
  load.
- **Handoff flights** — that only recent handoffs fly, that an unparseable
  timestamp animates nothing, and that a burst of six leaves as a staggered
  convoy with never more than three craft in the air.
- **Pokémon routing** — that each example instruction reaches the right
  capability, that "topics that could make good videos" is read as research
  rather than as a request to produce one, that another card game is not
  claimed, and that removing the agent removes its routes rather than leaving a
  mission nobody can run.
- **Pokémon execution and handoffs** — that all three capabilities run in Demo
  Mode and record every field, that the workflow adds exactly one new step and
  reuses the existing agents for the rest, that a real handoff is logged from the
  researcher to the Scriptwriter, and that the handoff carries the research
  itself rather than row ids the next agent cannot read.
- **Intellectual property** — that reproducing artwork, characters, branding or a
  redraw is blocked, that naming the franchise on a product is high risk rather
  than blocked, that an original design in the same genre is not penalised, and
  that the recorded risk is the assessed one rather than the one the model
  claimed.
- **Live market data** — that prices, valuations, populations, auction results
  and "trending now" all require a connected source, that history does not, and
  that the refusal names what would have to be connected.
- **No silent simulation** — that a real workspace with no Anthropic key fails
  the task, names the variable to set, writes nothing, and that Demo Mode still
  simulates so the pipeline can be exercised for free.
- **Spending controls** — that nothing spends before a ceiling is set, that the
  demo's figures are never treated as a real budget, that the monthly ceiling is
  a hard stop no approval overrides, that a runaway mission is caught by the
  per-mission ceiling, that last month's spend does not eat this month's, and
  that estimates never price an unknown model as cheap.
- **Owner-only budget** — that `ai_budget.manage` is held by the owner alone and
  that no seeded agent declares a capability that could reach it.
- **Clean start** — that provisioning creates the workforce and zero rows of
  history, zeroes every agent's counters, marks nothing as demo data, and is
  idempotent.
- **Persistence** — that a mission, its tasks, their output, the recorded cost
  and the activity trail are all rows rather than variables.
- **Id integrity** — that the full-video workflow completes its research step
  with no idea ahead of it, that an idea is still linked when one genuinely
  exists, that a blank id is refused with the column named, and that a sweep of
  every table the pipeline touches finds no id that is neither a uuid nor null.
- **Retrying** — that a failed step and the steps cancelled behind it are
  re-queued together, and that completed work is kept rather than re-run.
- **Structured output** — prose, empty replies, fenced JSON, unclosed fences,
  truncated JSON, a brace hiding in prose, malformed JSON and multi-block
  replies, each classified as itself; that a truncated reply gets more room and
  a shorter-answer instruction; that repair happens exactly once; that failure
  after repair is clean; and that the diagnostics never carry a prompt or a key.
- **Provisioning under real RLS** — run against a store that enforces the
  migrations' actual policies: that setup completes without a single refusal,
  writes nothing into the shared workflow library, still resolves a
  workflow-driven mission from code afterwards, keeps every row inside the
  owner, refuses a write for anybody else, and finishes a partial run on retry
  without duplicating a channel.

---

## Deployment

Any platform that runs Next.js. On Vercel:

1. Import the repository.
2. Add the environment variables from `.env.example` that you are using.
3. Deploy.

**Do not deploy publicly without Supabase.** Without it the application runs in
demo mode, which has no accounts — see
[How to access Command Centre](#how-to-access-command-centre) for the seven
steps, including creating your owner account before sign-ups are open.

Agent runs can take a while. The API routes that invoke agents set
`maxDuration = 300`; check that your plan allows it, or move long missions to a
background worker that calls `runMission`.

---

## Project layout

```
app/                      Routes
  api/                    Server endpoints (command, agents, approvals, missions, …)
  youtube/  etsy/         Business workspaces
components/
  galaxy/                 The solar system
  shell/                  Sidebar, command bar, contextual panel, activity stream
  agents/ missions/ approvals/ youtube/ etsy/
  layout/  ui/            Page chrome and primitives
lib/
  auth/                   Roles, permissions, session and permission guards
  operations/             Needs-you, today, workload, deadlines, digest, quick commands
  agents/                 Execution engine, capabilities, authority, memory, status
    production/           Voiceover, visual plan, assets, assembly, quality check
    islamic/              Sourced research and religious source verification
    templates.ts          Agent Builder starting points
    catalogue.ts          Capabilities grouped for the builder, from the registry
    presets.ts            Curated planet appearance
    factory.ts            The one place that knows an agent row's shape
  islamic/                Source policy, visual rules, verified-Arabic rendering
  workflows/              Definitions, state machine, runner, approvals
  integrations/
    ai/                   AI providers
    providers/            Voice, image, video, stock, ffmpeg renderer
  media/                  ffmpeg invocation, probing, captions, ASS generation
  jobs/                   Provider job queue
  production/             Pure resolvers and defaults (no server imports)
  finance/                Money, agent economics, production budgets
  db/                     Storage drivers, demo seed
  store/                  Client state
  supabase/               Browser and server clients
schemas/                  Zod schemas for every structured AI response
types/                    Domain, production and application state types
supabase/migrations/      SQL schema and Row Level Security
tests/                    Vitest
```

### Build order

The application was built in phases, and the architecture supports the rest:

1. Shell, storage, galaxy, agent inspector, demo data ✅
2. Tasks, missions, activity, approvals, Manager Agent ✅
3. AI provider architecture, agent execution engine, YouTube idea generator ✅
4. Research, scriptwriter, fact checker ✅
5. YouTube workspace and analytics foundations ✅
6. Etsy workspace ✅
7. Finance and agent economics ✅
8. End-to-end video production — voiceover, visual planning, asset generation,
   thumbnails, local ffmpeg assembly, quality checking, budgets and the job
   queue ✅
9. Owner accounts, custom agents and Islamic content — authentication, roles and
   RLS audit; the Agent Builder, templates and planet presets; sourced Islamic
   research, source verification, per-channel source policy and visual rules ✅
10. The daily operating layer — needs-you, today, work queue, Manager briefing
    and recommendations, mission priority and deadlines, business creation and
    switching, agent workload and memory management, and the Islamic source
    resolution gate ✅
11. Live platform data and scheduled automation — publishing, analytics and
    scheduling have interfaces and honest not-connected states, ready for
    adapters.
