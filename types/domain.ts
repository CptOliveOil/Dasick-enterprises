/**
 * Core domain types for Command Centre.
 *
 * These mirror the database schema in supabase/migrations. Anything persisted
 * has a UUID `id`, and ISO-8601 timestamp strings.
 */

export type UUID = string;
export type Timestamp = string;

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

/** Kind drives which workspace module a business renders. */
export const BUSINESS_KINDS = ['youtube', 'etsy', 'apps', 'generic'] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];

export interface Business {
  id: UUID;
  owner_id: UUID;
  name: string;
  slug: string;
  kind: BusinessKind;
  description: string;
  /** Accent colour used for this business' solar system. */
  colour: string;
  currency: string;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export const AGENT_STATUSES = [
  'idle',
  'working',
  'waiting',
  'needs_approval',
  'error',
  'offline',
  'disabled',
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/**
 * Authority levels bound what an agent may do without a human in the loop.
 * Anything above the agent's level must raise an approval instead of acting.
 */
export const AUTHORITY_LEVELS = [0, 1, 2, 3, 4] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export type AIProviderId = 'anthropic' | 'openai' | 'google' | 'mock';

/**
 * Organisational category, used for grouping and for prefilling the builder.
 * The engine does not read it — capabilities decide what an agent can do.
 */
export const AGENT_TYPES = [
  'research',
  'writer',
  'reviewer',
  'analyst',
  'manager',
  'production',
  'finance',
  'custom',
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

/**
 * How much of the agent's history reaches its prompt.
 *
 * `business` is the default and matches the original behaviour: memory is
 * loaded for this agent, scoped to the business it is working in. `none` runs
 * the agent stateless; `agent` lets it carry memory across businesses, which is
 * deliberately not the default — one channel's learned preferences must not
 * leak into another's.
 */
export const MEMORY_ACCESS_MODES = ['none', 'business', 'agent'] as const;
export type MemoryAccess = (typeof MEMORY_ACCESS_MODES)[number];

/** Purely visual configuration for an agent's planet. */
export interface PlanetVisual {
  /** Base sphere colour. */
  colour: string;
  /** Secondary colour used for atmosphere / rim light. */
  atmosphere: string;
  /** Sphere radius in world units (0.35 – 1.1 is the sensible range). */
  radius: number;
  /** Orbit radius from the command core. */
  orbit: number;
  /** Starting angle on the orbit, radians. */
  angle: number;
  /** Radians per second. Small values only — this is ambient motion. */
  speed: number;
  /** Vertical offset so orbits are not perfectly coplanar. */
  inclination: number;
  /** Renders a Saturn-style ring. */
  ring?: boolean;
  /** Surface noise intensity, 0–1. */
  roughness: number;
  /**
   * Optional lucide icon name shown on list rows and the inspector. The galaxy
   * itself stays iconless — a planet is a planet.
   */
  symbol?: string;
}

export interface Agent {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  name: string;
  slug: string;
  role: string;
  description: string;
  system_prompt: string;
  provider: AIProviderId;
  model: string;
  temperature: number;
  max_tokens: number;
  status: AgentStatus;
  authority_level: AuthorityLevel;
  current_task_id: UUID | null;
  /** Capability slugs the workflow engine matches tasks against. */
  capabilities: string[];
  /** Organisational category. Not read by the engine. */
  agent_type: AgentType;
  /** How much history is loaded into this agent's prompt. */
  memory_access: MemoryAccess;
  /** Template this agent was created from, when it was. */
  template_key: string | null;
  /** True for agents the operator created, as opposed to seeded ones. */
  is_custom: boolean;
  /**
   * Set when the agent is archived. Archived agents keep every task, cost and
   * activity record — they are simply no longer assignable. Nothing deletes an
   * agent, because that would orphan its history.
   */
  archived_at: Timestamp | null;
  visual: PlanetVisual;
  is_demo: boolean;
  tasks_completed: number;
  tasks_failed: number;
  /** Milliseconds. */
  average_execution_time: number;
  estimated_total_cost: number;
  last_run_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type AgentMemoryType =
  | 'insight'
  | 'preference'
  | 'fact'
  | 'constraint'
  | 'performance';

/** Who wrote a memory. Owner-written rules are not second-guessed; agent-written ones are labelled. */
export const MEMORY_ORIGINS = ['agent', 'owner'] as const;
export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number];

export const MEMORY_STATUSES = ['active', 'pending', 'archived'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/**
 * Importance band. `high` means a durable rule that will shape every future
 * mission — the sort of thing that must not appear in an agent's head without
 * the operator having seen it.
 */
export const MEMORY_BANDS = ['low', 'normal', 'high'] as const;
export type MemoryBand = (typeof MEMORY_BANDS)[number];

/** 1–5 maps onto the three bands the UI and the approval gate reason about. */
export function memoryBand(importance: number): MemoryBand {
  if (importance >= 5) return 'high';
  if (importance >= 3) return 'normal';
  return 'low';
}

export interface AgentMemory {
  id: UUID;
  agent_id: UUID;
  business_id: UUID | null;
  type: AgentMemoryType;
  content: string;
  /** 1 (trivia) – 5 (always include). */
  importance: number;
  source: string;
  origin: MemoryOrigin;
  /** `pending` memories are awaiting approval and are NOT loaded into prompts. */
  status: MemoryStatus;
  /** Pinned memories are loaded first, regardless of importance ordering. */
  pinned: boolean;
  created_at: Timestamp;
  last_used_at: Timestamp | null;
}

/* ------------------------------------------------------------------ */
/* Missions, tasks, workflows                                          */
/* ------------------------------------------------------------------ */

export const MISSION_STATUSES = [
  'planning',
  'running',
  'waiting',
  'needs_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MISSION_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type MissionPriority = (typeof MISSION_PRIORITIES)[number];

export const MISSION_PRIORITY_LABELS: Record<MissionPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
};

export interface Mission {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  /**
   * Set only for a mission created as one business' (or shared
   * infrastructure's) share of a system-level mission — e.g. one child of an
   * Operational Readiness run. Null for an ordinary, standalone mission.
   */
  parent_mission_id: UUID | null;
  /** Human-facing sequential number, e.g. 8 renders as "MISSION #008". */
  number: number;
  title: string;
  objective: string;
  status: MissionStatus;
  /** Defaults to `normal`. Everything being "high" would mean nothing is. */
  priority: MissionPriority;
  /**
   * Optional deadline, only ever set because the operator asked for one or
   * their instruction named a date. Nothing infers a deadline.
   */
  target_date: string | null;
  /** Optional HH:MM alongside `target_date`. */
  target_time: string | null;
  workflow_definition_id: UUID | null;
  /** Free-form payload captured when the mission was created. */
  context: Record<string, unknown>;
  progress: number;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
}

export const TASK_STATUSES = [
  'queued',
  'running',
  'waiting',
  'approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: UUID;
  owner_id: UUID;
  mission_id: UUID | null;
  business_id: UUID | null;
  agent_id: UUID | null;
  /** Which workflow step produced this task, if any. */
  step_key: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  /** 0–100, updated by long-running agents. */
  progress: number;
  is_demo: boolean;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  due_at: Timestamp | null;
}

export interface TaskDependency {
  id: UUID;
  task_id: UUID;
  depends_on_task_id: UUID;
}

/** A step in a reusable workflow definition. */
export interface WorkflowStep {
  /** Stable key, unique within the definition. */
  key: string;
  title: string;
  /** Capability required — resolved to a concrete agent at run time. */
  capability: string;
  /** Keys of steps that must complete first. */
  depends_on: string[];
  /** Raise an approval when this step completes, before continuing. */
  requires_approval: boolean;
  /** Approval label shown to the operator. */
  approval_label?: string;
}

export interface WorkflowDefinition {
  id: UUID;
  owner_id: UUID | null;
  business_id: UUID | null;
  key: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type WorkflowRunStatus = MissionStatus;

export interface WorkflowRun {
  id: UUID;
  mission_id: UUID;
  /**
   * Set only for a genuinely custom, database-defined workflow — a real row
   * in `workflow_definitions`. Null for a built-in: those are code
   * (`WORKFLOW_DEFINITIONS`), never a database row, and writing their
   * code-only id here is exactly the bug migration 0011 exists to prevent.
   * See `workflow_key` for how a built-in identifies itself instead.
   */
  workflow_definition_id: UUID | null;
  /** The workflow's `key`, set regardless of whether it is built-in or custom. */
  workflow_key: string | null;
  status: WorkflowRunStatus;
  /** step key -> task id */
  step_tasks: Record<string, UUID>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export type ApprovalKind =
  | 'idea'
  | 'research'
  | 'script'
  | 'thumbnail'
  | 'video'
  | 'product'
  | 'listing'
  | 'spend'
  | 'publish'
  /** A religious claim needs a source before the content may continue. */
  | 'source'
  /** An agent wants to record a durable rule that will shape future missions. */
  | 'memory'
  | 'generic';

/**
 * How the Approval Inbox groups decisions. Presentation only — the kind stays
 * the thing the domain reasons about.
 */
export const APPROVAL_GROUPS = {
  content: ['idea', 'research', 'script', 'thumbnail', 'video', 'product', 'listing'],
  sources: ['source'],
  budget: ['spend'],
  publishing: ['publish'],
  memory: ['memory'],
  other: ['generic'],
} as const satisfies Record<string, readonly ApprovalKind[]>;

export type ApprovalGroup = keyof typeof APPROVAL_GROUPS;

export function approvalGroupOf(kind: ApprovalKind): ApprovalGroup {
  for (const [group, kinds] of Object.entries(APPROVAL_GROUPS)) {
    if ((kinds as readonly string[]).includes(kind)) return group as ApprovalGroup;
  }
  return 'other';
}

/** Production-stage approvals reuse the kinds above; these name the stage. */
export const PRODUCTION_APPROVAL_KINDS: ApprovalKind[] = [
  'script',
  'thumbnail',
  'video',
  'spend',
  'publish',
];

export interface Approval {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  agent_id: UUID | null;
  kind: ApprovalKind;
  title: string;
  summary: string;
  /** The thing being approved, rendered by kind-specific viewers. */
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  feedback: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  resolved_at: Timestamp | null;
}

/* ------------------------------------------------------------------ */
/* Activity, notifications, chat                                       */
/* ------------------------------------------------------------------ */

export type ActivityKind =
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'handoff'
  | 'mission_created'
  | 'mission_completed'
  | 'approval_requested'
  | 'approval_resolved'
  | 'blocked'
  | 'job_started'
  | 'job_progress'
  | 'job_completed'
  | 'job_failed'
  | 'asset_created'
  | 'operator_action'
  | 'system';

export interface ActivityLog {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  agent_id: UUID | null;
  /** Set on `handoff` events — drives the galaxy connection beams. */
  target_agent_id: UUID | null;
  kind: ActivityKind;
  message: string;
  metadata: Record<string, unknown>;
  is_demo: boolean;
  created_at: Timestamp;
}

export type NotificationKind =
  | 'approval_required'
  | 'mission_completed'
  | 'agent_failed'
  | 'integration_disconnected'
  | 'budget_warning'
  | 'budget_exceeded'
  | 'provider_required'
  | 'render_failed'
  | 'video_ready'
  | 'upload_complete'
  | 'mission_blocked'
  | 'task_completed';

export interface AppNotification {
  id: UUID;
  owner_id: UUID;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: Timestamp;
}

export interface CommandMessage {
  id: UUID;
  owner_id: UUID;
  role: 'user' | 'manager' | 'system';
  content: string;
  mission_id: UUID | null;
  /** Structured references so chat is never disconnected from real work. */
  refs: {
    tasks?: UUID[];
    agents?: UUID[];
    approvals?: UUID[];
    /** A structured briefing or recommendation set, when the Manager produced one. */
    briefing?: Record<string, unknown>;
    recommendations?: Record<string, unknown>;
    /** The child mission ids an Operational Readiness message reports on or created. */
    readiness?: UUID[];
  };
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* YouTube module                                                      */
/* ------------------------------------------------------------------ */

export interface YoutubeChannel {
  id: UUID;
  business_id: UUID;
  name: string;
  handle: string;
  niche: string;
  target_audience: string;
  external_id: string | null;
  is_demo: boolean;
  created_at: Timestamp;
}

export type IdeaStatus = 'proposed' | 'approved' | 'rejected' | 'saved';

export interface OpportunityBreakdown {
  demand: number;
  competition: number;
  monetisation: number;
  longevity: number;
  click_potential: number;
}

export interface YoutubeIdea {
  id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  title: string;
  topic: string;
  niche: string;
  summary: string;
  target_audience: string;
  why_it_might_work: string;
  competition: string;
  demand: string;
  monetisation: string;
  longevity: string;
  click_potential: string;
  difficulty: string;
  confidence: number;
  sources: string[];
  notes: string;
  score: number;
  breakdown: OpportunityBreakdown;
  status: IdeaStatus;
  is_demo: boolean;
  created_at: Timestamp;
}

export type ClaimConfidence = 'verified' | 'interpretation' | 'needs_verification';

export interface ResearchFact {
  claim: string;
  detail: string;
  confidence: ClaimConfidence;
  source: string | null;
}

export interface YoutubeResearch {
  id: UUID;
  business_id: UUID;
  idea_id: UUID | null;
  task_id: UUID | null;
  overview: string;
  facts: ResearchFact[];
  statistics: ResearchFact[];
  timeline: { when: string; what: string }[];
  viewer_questions: string[];
  competitor_coverage: string[];
  content_gaps: string[];
  hooks: string[];
  interesting_details: string[];
  risks: string[];
  uncertain_claims: string[];
  is_demo: boolean;
  created_at: Timestamp;
}

export interface ScriptSection {
  kind:
    | 'hook'
    | 'introduction'
    | 'main'
    | 'transition'
    | 'pattern_interrupt'
    | 'payoff'
    | 'ending'
    | 'cta';
  heading: string;
  body: string;
}

export type ScriptStatus =
  | 'draft'
  | 'fact_checking'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected';

export interface YoutubeScript {
  id: UUID;
  business_id: UUID;
  idea_id: UUID | null;
  research_id: UUID | null;
  task_id: UUID | null;
  title: string;
  sections: ScriptSection[];
  word_count: number;
  estimated_duration_seconds: number;
  tone: string;
  audience: string;
  goal: string;
  status: ScriptStatus;
  version: number;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface YoutubeScriptVersion {
  id: UUID;
  script_id: UUID;
  version: number;
  sections: ScriptSection[];
  note: string;
  created_at: Timestamp;
}

export type FactCheckVerdict =
  | 'verified'
  | 'needs_review'
  | 'potentially_incorrect'
  | 'unsourced';

export interface FactCheckFinding {
  claim: string;
  verdict: FactCheckVerdict;
  reasoning: string;
  suggested_correction: string | null;
}

export interface YoutubeFactCheck {
  id: UUID;
  business_id: UUID;
  script_id: UUID | null;
  task_id: UUID | null;
  findings: FactCheckFinding[];
  /** True when nothing is `potentially_incorrect`. Blocks progression if false. */
  passed: boolean;
  summary: string;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface ThumbnailConcept {
  id: UUID;
  business_id: UUID;
  video_id: UUID | null;
  script_id: UUID | null;
  concept_title: string;
  visual_description: string;
  subject: string;
  background: string;
  composition: string;
  text: string;
  emotion: string;
  colour_direction: string;
  contrast_strategy: string;
  click_psychology: string;
  image_prompt: string;
  /** 0–1, the strategist's own confidence in the concept. */
  confidence: number;
  reasoning: string;
  /** The generated candidate image, once an image provider has produced one. */
  asset_id: UUID | null;
  selected: boolean;
  is_demo: boolean;
  created_at: Timestamp;
}

export const VIDEO_STATUSES = [
  'idea',
  'research',
  'script',
  'fact_check',
  'thumbnail',
  'production',
  'awaiting_approval',
  'ready',
  'scheduled',
  'published',
  'blocked',
  'failed',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export interface YoutubeVideo {
  id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  idea_id: UUID | null;
  script_id: UUID | null;
  mission_id: UUID | null;
  number: number;
  title: string;
  status: VideoStatus;
  /** Where the video is in the production pipeline. */
  stage: import('./production').ProductionStage;
  /** Set when production cannot continue, with the exact reason. */
  blocked_reason: string | null;
  alternative_titles: string[];
  selected_thumbnail_id: UUID | null;
  /** Media assets: the chosen thumbnail image and the rendered video. */
  thumbnail_asset_id: UUID | null;
  final_asset_id: UUID | null;
  voiceover_id: UUID | null;
  timeline_id: UUID | null;
  metadata_id: UUID | null;
  estimated_cost: number;
  actual_cost: number;
  /** Set only after a genuine upload returns an id. */
  published_external_id: string | null;
  publish_at: Timestamp | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type AssetStatus = 'pending' | 'requested' | 'ready' | 'failed';

export interface YoutubeScene {
  id: UUID;
  video_id: UUID;
  /** Set once scenes belong to a mission; older rows may not have it. */
  business_id: UUID | null;
  mission_id: UUID | null;
  scene_number: number;
  /** Seconds from the start of the video, estimated from narration length. */
  start_time_estimate: number;
  duration_seconds: number;
  narration: string;
  visual_type: import('./production').VisualType;
  visual_direction: string;
  b_roll_query: string;
  image_prompt: string;
  video_prompt: string;
  on_screen_text: string;
  animation_notes: string;
  transition: string;
  /** 1 (filler) – 5 (the shot the video needs). Drives spend priority. */
  importance: number;
  /** How this scene's visual should be obtained. Chosen by the Visual Director. */
  asset_strategy: import('./production').AssetStrategy;
  asset_status: AssetStatus;
  /** The media asset currently attached to this scene. */
  asset_id: UUID | null;
  status: import('./production').SceneStatus;
  error: string | null;
  is_demo: boolean;
}

export interface YoutubeAnalytics {
  id: UUID;
  business_id: UUID;
  video_id: UUID | null;
  channel_id: UUID | null;
  date: string;
  views: number;
  impressions: number;
  ctr: number;
  watch_time_minutes: number;
  average_view_duration_seconds: number;
  likes: number;
  comments: number;
  subscribers_gained: number;
  revenue: number;
  is_demo: boolean;
}

/** AI-derived conclusions, stored apart from raw analytics rows. */
export interface ChannelIntelligence {
  id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  best_topics: string[];
  best_title_structures: string[];
  thumbnail_patterns: string[];
  ideal_duration: string;
  retention_trends: string[];
  best_publishing_periods: string[];
  generated_at: Timestamp;
  is_demo: boolean;
}

/* ------------------------------------------------------------------ */
/* Etsy module                                                         */
/* ------------------------------------------------------------------ */

export interface EtsyStore {
  id: UUID;
  business_id: UUID;
  name: string;
  url: string;
  niche: string;
  external_id: string | null;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface EtsyOpportunity {
  id: UUID;
  business_id: UUID;
  store_id: UUID | null;
  mission_id: UUID | null;
  task_id: UUID | null;
  product: string;
  target_customer: string;
  problem: string;
  demand: string;
  competition: string;
  pricing_range: string;
  seasonality: string;
  production_difficulty: string;
  seo_opportunity: string;
  market_gap: string;
  profit_potential: string;
  score: number;
  breakdown: OpportunityBreakdown;
  status: IdeaStatus;
  is_demo: boolean;
  created_at: Timestamp;
}

export const ETSY_PRODUCT_STATUSES = [
  'idea',
  'research',
  'creating',
  'listing',
  'awaiting_approval',
  'ready',
  'published',
] as const;
export type EtsyProductStatus = (typeof ETSY_PRODUCT_STATUSES)[number];

/** The Visual Director's brief before any artwork is generated. */
export interface EtsyDesignConcept {
  style: string;
  palette: string[];
  mood: string;
  primary_subject: string;
  composition_notes: string;
  /** Fed directly to the image provider. Never names a real brand or IP. */
  artwork_prompt: string;
}

export interface EtsyProduct {
  id: UUID;
  business_id: UUID;
  store_id: UUID | null;
  opportunity_id: UUID | null;
  name: string;
  description: string;
  target_buyer: string;
  category: string;
  assets_required: string[];
  production_checklist: { item: string; done: boolean }[];
  price: number;
  estimated_cost: number;
  status: EtsyProductStatus;
  design_concept: EtsyDesignConcept | null;
  artwork_asset_id: UUID | null;
  upscaled_asset_id: UUID | null;
  /** Aspect ratio (e.g. "1:1", "4:5") to the media asset cropped to it. */
  variant_asset_ids: Record<string, UUID>;
  mockup_asset_ids: UUID[];
  package_asset_id: UUID | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EtsyListing {
  id: UUID;
  business_id: UUID;
  product_id: UUID | null;
  task_id: UUID | null;
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  category_suggestions: string[];
  price_suggestion: number;
  benefits: string[];
  faq: { question: string; answer: string }[];
  image_brief: string;
  status: 'draft' | 'awaiting_approval' | 'approved' | 'published';
  is_demo: boolean;
  created_at: Timestamp;
}

export interface EtsyKeyword {
  id: UUID;
  business_id: UUID;
  keyword: string;
  search_volume: string;
  competition: string;
  relevance: number;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface EtsyAnalytics {
  id: UUID;
  business_id: UUID;
  store_id: UUID | null;
  date: string;
  visits: number;
  orders: number;
  revenue: number;
  conversion_rate: number;
  is_demo: boolean;
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export type TransactionKind = 'revenue' | 'expense' | 'ai_cost' | 'subscription';

export interface FinancialTransaction {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  kind: TransactionKind;
  category: string;
  description: string;
  /** Always stored in the business' currency, default GBP. */
  amount: number;
  currency: string;
  occurred_at: Timestamp;
  /** Links spend back to the thing that caused it, e.g. a video. */
  reference_type: string | null;
  reference_id: UUID | null;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface ApiUsage {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  agent_id: UUID | null;
  task_id: UUID | null;
  provider: AIProviderId;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  duration_ms: number;
  is_demo: boolean;
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

export type IntegrationKind =
  | 'ai'
  | 'youtube'
  | 'etsy'
  | 'voice'
  | 'image'
  | 'video';

export interface IntegrationConnection {
  id: UUID;
  owner_id: UUID;
  kind: IntegrationKind;
  provider: string;
  label: string;
  /**
   * Honest connection state, derived from server-side configuration only.
   * Never set to `connected` unless credentials actually exist.
   */
  connected: boolean;
  /** Env var names required to connect. Shown to the operator as instructions. */
  required_env: string[];
  notes: string;
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/**
 * Roles exist so team support can be added later without a migration and
 * without revisiting every permission check. Today an account has exactly one
 * profile and it is the `owner`; the other three are defined, enforced and
 * unused.
 */
export const ACCOUNT_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export interface Profile {
  id: UUID;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: AccountRole;
  timezone: string;
  currency: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Business intelligence memory                                        */
/* ------------------------------------------------------------------ */

/**
 * What a finished piece of work turned out to be worth.
 *
 * One row per completed mission, written automatically when the mission
 * finishes and enriched afterwards as real performance data arrives. This is
 * the workspace's long memory: agent memory holds *rules* an operator agreed
 * to, and this holds *outcomes* nobody had to agree to because they happened.
 *
 * Every performance field is nullable and every one starts null. A mission that
 * has completed is not a video that has been watched, and a workspace that
 * pretends otherwise teaches its own agents to be confident about numbers it
 * invented. They fill in only when a real analytics row exists.
 */
export interface MissionOutcome {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  /** Deliberately generic: a video title, a listing name, a topic. */
  topic: string;
  category: string;
  /** `youtube`, `etsy`, `islamic` — so a brief can be phrased for the business. */
  business_kind: string;
  /** What was produced, when the mission produced a durable thing. */
  entity_kind: string | null;
  entity_id: UUID | null;
  published_at: Timestamp | null;

  /* Audience — YouTube and anything else with viewers. */
  views: number | null;
  impressions: number | null;
  /** 0–1. */
  ctr: number | null;
  thumbnail_ctr: number | null;
  watch_time_minutes: number | null;
  /** 0–1: how far through the average viewer got. */
  average_view_percentage: number | null;
  comments: number | null;

  /* Commerce — Etsy and anything else that sells. */
  units_sold: number | null;
  /** 0–1. */
  conversion_rate: number | null;
  revenue: number | null;
  /** Revenue per thousand views. */
  rpm: number | null;

  /* Cost of production, which is known the moment the mission ends. */
  ai_cost: number;
  minutes_taken: number | null;
  /** 0–100, from how much work and how much intervention the mission needed. */
  difficulty: number | null;
  /** 0–100 once real performance is known. Null until then, never guessed. */
  success_score: number | null;

  /** Anything a number cannot carry, in the operator's or an agent's words. */
  notes: string[];
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}
