import { config } from '@/lib/config';

/**
 * Media provider interfaces. Deliberately narrow so a concrete adapter can be
 * dropped in without touching the production pipeline.
 */

export interface VoiceRequest {
  text: string;
  voice?: string;
  format?: 'mp3' | 'wav';
}

export interface ImageRequest {
  prompt: string;
  aspectRatio?: string;
  style?: string;
}

export interface VideoRequest {
  prompt: string;
  durationSeconds?: number;
  referenceImageUrl?: string;
}

export interface MediaAsset {
  url: string;
  provider: string;
  estimatedCost: number;
}

export class ProviderNotConnectedError extends Error {
  constructor(
    readonly kind: string,
    readonly requiredEnv: string[],
  ) {
    super(
      `No ${kind} provider is connected. Set ${requiredEnv.join(' and ')} to enable it.`,
    );
    this.name = 'ProviderNotConnectedError';
  }
}

export interface VoiceProvider {
  readonly connected: boolean;
  generate(request: VoiceRequest): Promise<MediaAsset>;
}

export interface ImageProvider {
  readonly connected: boolean;
  generate(request: ImageRequest): Promise<MediaAsset>;
}

export interface VideoProvider {
  readonly connected: boolean;
  generate(request: VideoRequest): Promise<MediaAsset>;
}

/**
 * Until a real provider is configured, these throw rather than returning a
 * placeholder URL. An asset that does not exist must never look like one that
 * does.
 */
class UnconnectedProvider {
  readonly connected = false;
  constructor(
    private kind: string,
    private requiredEnv: string[],
  ) {}
  async generate(): Promise<MediaAsset> {
    throw new ProviderNotConnectedError(this.kind, this.requiredEnv);
  }
}

export function getVoiceProvider(): VoiceProvider {
  if (!config.voice.apiKey) {
    return new UnconnectedProvider('voice', ['VOICE_PROVIDER', 'VOICE_PROVIDER_API_KEY']);
  }
  throw new Error(
    `Voice provider "${config.voice.provider}" has credentials but no adapter is registered. Add one in lib/integrations/media.ts.`,
  );
}

export function getImageProvider(): ImageProvider {
  if (!config.image.apiKey) {
    return new UnconnectedProvider('image', ['IMAGE_PROVIDER', 'IMAGE_PROVIDER_API_KEY']);
  }
  throw new Error(
    `Image provider "${config.image.provider}" has credentials but no adapter is registered. Add one in lib/integrations/media.ts.`,
  );
}

export function getVideoProvider(): VideoProvider {
  if (!config.video.apiKey) {
    return new UnconnectedProvider('video', ['VIDEO_PROVIDER', 'VIDEO_PROVIDER_API_KEY']);
  }
  throw new Error(
    `Video provider "${config.video.provider}" has credentials but no adapter is registered. Add one in lib/integrations/media.ts.`,
  );
}
