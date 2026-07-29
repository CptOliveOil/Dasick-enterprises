# Command Centre

An AI business operating system. Command Centre runs an autonomous AI workforce
across several businesses — and presents that workforce as a living solar
system rather than a grid of cards.

Each planet is a real agent. Its glow is its actual status, the ring around it
means an approval is genuinely outstanding, and the beam between two planets is
drawn from a recorded handoff. The galaxy is the primary interface; every part
of it is also reachable through ordinary lists, tables and keyboard navigation.

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
- [How it works](#how-it-works)
- [Accounts, roles and access](#accounts-roles-and-access)
- [Custom agents](#custom-agents)
- [Daily operations](#daily-operations)
- [The YouTube production pipeline](#the-youtube-production-pipeline)
- [Islamic content](#islamic-content)
- [Galaxy architecture](#galaxy-architecture)
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

With no configuration at all the application starts in **demo mode**: eighteen
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
`0003_accounts_agents_islamic.sql`, `0004_operations.sql`. Paste them into the
SQL editor, or use `supabase db push`. Migration `0003` creates the owner role
column, the role-immutability trigger and the Islamic tables; `0004` adds
mission priority and deadlines, memory provenance and the source resolution
table.

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
| `ANTHROPIC_API_KEY` | Primary AI provider. Without it agents run simulated. |
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
   `0004_operations.sql`. Either paste them into the SQL editor, or use the
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
Researcher, Islamic Source Checker, and a blank Custom Agent. A template is
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

## Galaxy architecture

Built with React Three Fiber, loaded only in the browser and only after a WebGL
check. `components/galaxy/`:

| File | Responsibility |
| --- | --- |
| `Galaxy.tsx` | Entry point: device detection, hover card, view controls, mobile and no-WebGL fallbacks |
| `GalaxyScene.tsx` | The scene, camera commands and orbit controls |
| `Planet.tsx` | One agent — orbit, rotation, status glow, attention ring, task count |
| `CommandCore.tsx` | The star at the centre; pulses while a command is running |
| `Connections.tsx` | Handoff beams, drawn from recent `handoff` activity logs |
| `Starfield.tsx` | Background stars and orbit paths |
| `MobileGalaxy.tsx` | A simplified SVG system for small screens |
| `quality.ts` | Device capability detection and quality tiers |
| `textures.ts` | Procedural planet surfaces and glow sprites, generated once and cached |

**Everything visible is bound to state.** Glow comes from `agent.status`. The
amber ring appears only while an approval is pending. A beam is drawn only while
a real handoff log is recent, and fades as that log ages.

**Performance.** Three quality tiers are chosen from pointer type, viewport,
core count and reported memory. Touch devices and narrow viewports always get
the cheap profile. Textures are generated once per colour and shared.

**Reduced motion.** With `prefers-reduced-motion: reduce`, orbital movement,
rotation and pulses stop. State is still fully conveyed by colour, ring and
text.

**Accessibility.** The galaxy is never the only way to do anything. Every agent,
task, mission and approval is reachable through the sidebar as a list or table.
Without WebGL, the universe page renders a keyboard-navigable agent list.

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
