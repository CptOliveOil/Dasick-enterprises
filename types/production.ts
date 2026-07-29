/**
 * Production domain types — the faceless-video pipeline that runs after a
 * script is approved.
 *
 * These extend the core model in `types/domain.ts` rather than replacing any
 * of it: scenes still live on `youtube_scenes`, videos on `youtube_videos`.
 */

import type { Timestamp, UUID } from './domain';

/* ------------------------------------------------------------------ */
/* Media assets                                                        */
/* ------------------------------------------------------------------ */

export const MEDIA_ASSET_TYPES = [
  'voiceover',
  'image',
  'video_clip',
  'thumbnail',
  'music',
  'sound_effect',
  'final_video',
  'subtitle_file',
] as const;
export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];

export type MediaAssetStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'replaced';

/**
 * A file the system actually holds. `storage_path` is where it lives;
 * `public_url` is only ever set when a real, reachable URL exists.
 */
export interface MediaAsset {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  video_id: UUID | null;
  scene_id: UUID | null;
  task_id: UUID | null;
  type: MediaAssetType;
  /** Which provider produced it. `ffmpeg` and `simulated` are both honest values. */
  provider: string;
  provider_asset_id: string | null;
  /** Path within the configured storage driver. Null while still generating. */
  storage_path: string | null;
  /** Only set when the asset is genuinely reachable at that URL. */
  public_url: string | null;
  mime_type: string;
  /** Seconds, for time-based media. */
  duration: number | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  generation_prompt: string | null;
  generation_cost: number;
  status: MediaAssetStatus;
  /**
   * True when the asset is a clearly-marked placeholder produced in Demo Mode.
   * The UI must never present a simulated asset as a real one.
   */
  simulated: boolean;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Voiceover                                                           */
/* ------------------------------------------------------------------ */

export type VoiceoverStatus =
  | 'planned'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'blocked';

/** One narration segment, aligned to a script section. */
export interface VoiceoverSegment {
  index: number;
  section_heading: string;
  text: string;
  /** Delivery note for providers that support it, e.g. "slower, grave". */
  direction: string;
  estimated_duration_seconds: number;
}

export interface YoutubeVoiceover {
  id: UUID;
  business_id: UUID;
  video_id: UUID | null;
  script_id: UUID;
  mission_id: UUID | null;
  task_id: UUID | null;
  voice_provider: string;
  voice_id: string;
  voice_name: string;
  speed: number;
  /** Provider-specific tuning, e.g. stability/similarity. Kept opaque. */
  settings: Record<string, unknown>;
  language: string;
  narration_style: string;
  segments: VoiceoverSegment[];
  /** Seconds. Measured from the rendered audio, not estimated, once ready. */
  audio_duration: number | null;
  audio_asset_id: UUID | null;
  generation_cost: number;
  status: VoiceoverStatus;
  error: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Scenes and visual planning                                          */
/* ------------------------------------------------------------------ */

export const ASSET_STRATEGIES = [
  'generated_image',
  'generated_video',
  'stock',
  'text_motion',
  'screen_recording',
  'archive_public_source',
  'existing_asset',
] as const;
export type AssetStrategy = (typeof ASSET_STRATEGIES)[number];

export type VisualType = 'image' | 'video' | 'text' | 'archive' | 'diagram';

export type SceneStatus =
  | 'planned'
  | 'awaiting_asset'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'blocked'
  | 'approved';

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export interface TimelineItem {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  scene_id: UUID | null;
  video_asset_id: UUID | null;
  audio_asset_id: UUID | null;
  text_overlay: string;
  transition: string;
  /** Ken Burns direction, or 'none'. */
  animation: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'none';
  volume: number;
  metadata: Record<string, unknown>;
}

export type TimelineStatus = 'draft' | 'ready' | 'rendering' | 'rendered' | 'failed';

export interface YoutubeTimeline {
  id: UUID;
  business_id: UUID;
  video_id: UUID;
  mission_id: UUID | null;
  task_id: UUID | null;
  items: TimelineItem[];
  /** Seconds. */
  total_duration: number;
  width: number;
  height: number;
  fps: number;
  narration_asset_id: UUID | null;
  music_asset_id: UUID | null;
  subtitle_asset_id: UUID | null;
  burn_in_captions: boolean;
  status: TimelineStatus;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export const JOB_STATUSES = [
  'queued',
  'submitted',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobKind =
  | 'voiceover'
  | 'image'
  | 'video_clip'
  | 'stock_fetch'
  | 'render'
  | 'thumbnail';

/**
 * A unit of long-running work. Persisted so progress survives the request that
 * started it, and so an external provider's job can be polled later.
 */
export interface ProviderJob {
  id: UUID;
  owner_id: UUID;
  business_id: UUID | null;
  mission_id: UUID | null;
  video_id: UUID | null;
  scene_id: UUID | null;
  task_id: UUID | null;
  kind: JobKind;
  provider: string;
  /** The provider's own job handle, when it issues one. */
  external_id: string | null;
  status: JobStatus;
  progress: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  estimated_cost: number;
  actual_cost: number | null;
  attempts: number;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  updated_at: Timestamp;
}

export type RenderJobStatus = JobStatus;

export interface YoutubeRenderJob {
  id: UUID;
  business_id: UUID;
  video_id: UUID;
  timeline_id: UUID;
  mission_id: UUID | null;
  task_id: UUID | null;
  job_id: UUID | null;
  renderer: string;
  status: RenderJobStatus;
  progress: number;
  output_asset_id: UUID | null;
  /** Trimmed renderer output, kept for diagnosing a failure honestly. */
  log: string;
  error: string | null;
  duration_ms: number | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Quality control                                                     */
/* ------------------------------------------------------------------ */

export type QualityVerdict = 'pass' | 'warning' | 'fail';
export type QualitySeverity = 'info' | 'warning' | 'blocking';

export interface QualityIssue {
  code: string;
  severity: QualitySeverity;
  message: string;
  /** What the operator can do about it. */
  remedy: string;
  scene_number: number | null;
}

export interface YoutubeQualityCheck {
  id: UUID;
  business_id: UUID;
  video_id: UUID;
  mission_id: UUID | null;
  task_id: UUID | null;
  verdict: QualityVerdict;
  issues: QualityIssue[];
  summary: string;
  /** Facts measured from the rendered file, not inferred. */
  measured: {
    duration_seconds: number | null;
    has_audio_track: boolean | null;
    width: number | null;
    height: number | null;
    file_size: number | null;
  };
  is_demo: boolean;
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export interface VideoChapter {
  start_seconds: number;
  title: string;
}

export interface YoutubeMetadata {
  id: UUID;
  business_id: UUID;
  video_id: UUID;
  task_id: UUID | null;
  title: string;
  alternative_titles: string[];
  description: string;
  short_description: string;
  tags: string[];
  hashtags: string[];
  chapters: VideoChapter[];
  pinned_comment: string;
  version: number;
  selected: boolean;
  is_demo: boolean;
  created_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Budgets and channel production settings                             */
/* ------------------------------------------------------------------ */

export interface ProductionBudget {
  id: UUID;
  owner_id: UUID;
  business_id: UUID;
  currency: string;
  /** Hard ceiling for one video. Exceeding it blocks rather than warns. */
  max_cost_per_video: number;
  max_image_spend: number;
  max_video_spend: number;
  max_voice_spend: number;
  /** Any single step estimated above this raises a spend approval first. */
  approval_threshold: number;
  /** How many asset generations may run at once. */
  concurrency: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type MusicMode = 'none' | 'uploaded' | 'provider';

/** Per-channel production defaults: voice, captions, music, publishing. */
export interface ProductionSettings {
  id: UUID;
  owner_id: UUID;
  business_id: UUID;
  channel_id: UUID | null;
  voice_provider: string;
  voice_id: string;
  voice_name: string;
  voice_speed: number;
  language: string;
  narration_style: string;
  width: number;
  height: number;
  fps: number;
  captions_enabled: boolean;
  burn_in_captions: boolean;
  music_mode: MusicMode;
  music_asset_id: UUID | null;
  music_volume: number;
  music_fade_in: number;
  music_fade_out: number;
  /** Off by default. Publishing is an external action and stays gated. */
  auto_publish_after_approval: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Pipeline description                                                */
/* ------------------------------------------------------------------ */

export const PRODUCTION_STAGES = [
  'ideas',
  'research',
  'script',
  'fact_check',
  'script_approval',
  'voiceover',
  'visual_plan',
  'assets',
  'thumbnail',
  'metadata',
  'assembly',
  'quality_check',
  'final_approval',
  'publish',
] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  ideas: 'Idea',
  research: 'Research',
  script: 'Script',
  fact_check: 'Fact check',
  script_approval: 'Script approval',
  voiceover: 'Voiceover',
  visual_plan: 'Visual plan',
  assets: 'Assets',
  thumbnail: 'Thumbnail',
  metadata: 'Metadata',
  assembly: 'Assembly',
  quality_check: 'Quality check',
  final_approval: 'Final approval',
  publish: 'Publish',
};
