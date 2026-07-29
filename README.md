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
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Demo mode](#demo-mode)
- [How it works](#how-it-works)
- [The YouTube production pipeline](#the-youtube-production-pipeline)
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

With no configuration at all the application starts in **demo mode**: sixteen
agents, four missions, live activity, approvals, finance — all seeded, all
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
3. Run the migrations, in order. Either paste
   `supabase/migrations/0001_initial_schema.sql` then
   `supabase/migrations/0002_production_pipeline.sql` into the SQL editor, or
   with the Supabase CLI:

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

---

## Deployment

Any platform that runs Next.js. On Vercel:

1. Import the repository.
2. Add the environment variables from `.env.example` that you are using.
3. Deploy.

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
  agents/                 Execution engine, capabilities, authority, memory, status
    production/           Voiceover, visual plan, assets, assembly, quality check
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
9. Live platform data and scheduled automation — publishing, analytics and
   scheduling have interfaces and honest not-connected states, ready for
   adapters.
