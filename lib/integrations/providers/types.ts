/**
 * Media provider contracts.
 *
 * Every provider reports `isConnected()` from real server configuration. A
 * provider that is not connected must throw rather than return a placeholder —
 * the workflow then blocks with the reason, which is the whole point.
 */

export type ProviderKind = 'voice' | 'image' | 'video' | 'stock' | 'renderer';

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
