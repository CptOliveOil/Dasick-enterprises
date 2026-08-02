/**
 * Media provider contracts.
 *
 * Every provider reports `isConnected()` from real server configuration. A
 * provider that is not connected must throw rather than return a placeholder —
 * the workflow then blocks with the reason, which is the whole point.
 */

export type ProviderKind =
  | 'voice'
  | 'image'
  | 'video'
  | 'stock'
  | 'renderer'
  | 'music'
  | 'subtitles'
  | 'publisher'
  | 'analytics';

export class ProviderNotConnectedError extends Error {
  readonly notConnected = true;
  constructor(
    readonly kind: ProviderKind,
    readonly requiredEnv: string[],
    message?: string,
  ) {
    super(
      message ??
        `No ${kind} provider is connected. Set ${requiredEnv.join(' and ')} to enable it.`,
    );
    this.name = 'ProviderNotConnectedError';
  }
}

export function isNotConnected(error: unknown): error is ProviderNotConnectedError {
  return Boolean(error && typeof error === 'object' && 'notConnected' in error);
}

/** What a provider produced, before it becomes a media asset. */
export interface ProducedMedia {
  data: Buffer;
  mimeType: string;
  extension: string;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  providerAssetId?: string | null;
  /** What it actually cost, when the provider reports it. */
  cost: number;
  /** True only for clearly-marked Demo Mode placeholders. */
  simulated: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProviderDescriptor {
  kind: ProviderKind;
  /** Human name, or "Not configured". */
  name: string;
  connected: boolean;
  requiredEnv: string[];
  capabilities: string[];
  /** Rough unit pricing, shown to the operator. Empty when unknown. */
  pricingNote: string;
  /** True when this is the Demo Mode placeholder rather than a real provider. */
  simulated: boolean;
}

export interface BaseProvider {
  readonly descriptor: ProviderDescriptor;
  isConnected(): boolean;
  /** Cheap round trip used by the "Test connection" action. */
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  language: string;
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
  speed: number;
  language: string;
  /** Provider-specific tuning, passed through untouched. */
  settings: Record<string, unknown>;
}

export interface VoiceProvider extends BaseProvider {
  listVoices(): Promise<VoiceOption[]>;
  generateSpeech(request: SpeechRequest): Promise<ProducedMedia>;
  /** For providers that generate asynchronously. */
  getGenerationStatus(externalId: string): Promise<{ status: string; progress: number }>;
  estimateCost(characters: number): number;
}

/* ------------------------------------------------------------------ */
/* Image                                                               */
/* ------------------------------------------------------------------ */

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  style?: string;
  /** Distinguishes a thumbnail from a scene still for providers that care. */
  purpose?: 'scene' | 'thumbnail';
}

export interface ImageProvider extends BaseProvider {
  generateImage(request: ImageRequest): Promise<ProducedMedia>;
  getStatus(externalId: string): Promise<{ status: string; progress: number }>;
  estimateCost(count: number): number;
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

export interface VideoClipRequest {
  prompt: string;
  durationSeconds: number;
  width: number;
  height: number;
  referenceImagePath?: string;
}

export interface VideoProvider extends BaseProvider {
  generateVideo(request: VideoClipRequest): Promise<ProducedMedia>;
  getStatus(externalId: string): Promise<{ status: string; progress: number }>;
  estimateCost(seconds: number): number;
}

/* ------------------------------------------------------------------ */
/* Stock media                                                         */
/* ------------------------------------------------------------------ */

export interface StockResult {
  id: string;
  previewUrl: string;
  description: string;
  /** Licence terms. Never fetch anything without one. */
  licence: string;
  width: number;
  height: number;
  kind: 'image' | 'video';
}

export interface StockMediaProvider extends BaseProvider {
  search(query: string, kind: 'image' | 'video'): Promise<StockResult[]>;
  fetchAsset(result: StockResult): Promise<ProducedMedia>;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

export interface RenderRequest {
  jobId: string;
  width: number;
  height: number;
  fps: number;
  /** Ordered clips. Each already resolved to a local file. */
  clips: {
    filePath: string;
    kind: 'image' | 'video';
    durationSeconds: number;
    animation: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'none';
    transition: string;
  }[];
  narrationPath: string | null;
  musicPath: string | null;
  musicVolume: number;
  musicFadeIn: number;
  musicFadeOut: number;
  /** ASS subtitle file, when text should be burned into the picture. */
  assPath: string | null;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

export interface RenderResult {
  outputPath: string;
  durationMs: number;
  log: string;
}

export interface VideoRenderer extends BaseProvider {
  renderTimeline(request: RenderRequest): Promise<RenderResult>;
  getRenderStatus(jobId: string): Promise<{ status: string; progress: number }>;
  cancelRender(jobId: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Music                                                               */
/* ------------------------------------------------------------------ */

export interface MusicRequest {
  /** What the bed should feel like, in the editor's language. */
  mood: string;
  durationSeconds: number;
  /** Beats per minute, when the edit wants a specific pace. */
  tempo?: number | null;
  /** Kept out of the mix under narration; providers vary in how they use it. */
  intensity?: 'bed' | 'standard' | 'feature';
}

export interface MusicProvider extends BaseProvider {
  generateMusic(request: MusicRequest): Promise<ProducedMedia>;
  estimateCost(seconds: number): number;
}

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */

export interface SubtitleCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface SubtitleRequest {
  /** The narration audio, when the provider transcribes rather than aligns. */
  audioPath: string | null;
  /** The words that were narrated, for forced alignment. */
  transcript: string;
  language: string;
  /** Maximum characters per displayed line. */
  lineLength: number;
}

export interface SubtitleResult {
  cues: SubtitleCue[];
  /** WebVTT, for the platform's own caption track. */
  vtt: string;
  /** True when timings came from real alignment rather than estimation. */
  aligned: boolean;
  cost: number;
  simulated: boolean;
}

export interface SubtitleProvider extends BaseProvider {
  generateSubtitles(request: SubtitleRequest): Promise<SubtitleResult>;
  estimateCost(seconds: number): number;
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

export type PublishVisibility = 'private' | 'unlisted' | 'scheduled' | 'public';

export interface PublishRequest {
  videoPath: string;
  thumbnailPath: string | null;
  captionsVtt: string | null;
  title: string;
  description: string;
  tags: string[];
  /** Chapter markers, rendered into the description by the adapter. */
  chapters: { startSeconds: number; label: string }[];
  visibility: PublishVisibility;
  /** Required when visibility is `scheduled`. */
  publishAt: string | null;
  /** Platform-required self-declaration. Never inferred. */
  madeForKids: boolean;
  /** Declares AI-generated or synthetic content where the platform asks. */
  syntheticMedia: boolean;
}

export interface PublishResult {
  /** The platform's own id. Only ever set by a genuine upload. */
  externalId: string;
  url: string;
  visibility: PublishVisibility;
  cost: number;
  simulated: boolean;
}

/**
 * Uploading is the one irreversible act in the system, so a publisher is held
 * to a stricter contract than the rest: it must refuse rather than approximate,
 * and `simulated` must be true unless something genuinely left the building.
 */
export interface Publisher extends BaseProvider {
  publish(request: PublishRequest): Promise<PublishResult>;
  /** Removes a video the workspace published. Not all platforms allow it. */
  unpublish(externalId: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface AnalyticsWindow {
  externalId: string;
  /** ISO dates, inclusive. */
  from: string;
  to: string;
}

export interface AnalyticsDay {
  date: string;
  views: number;
  impressions: number;
  /** 0–1. */
  clickThroughRate: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  revenue: number;
}

export interface AnalyticsProvider extends BaseProvider {
  collectAnalytics(window: AnalyticsWindow): Promise<AnalyticsDay[]>;
}
