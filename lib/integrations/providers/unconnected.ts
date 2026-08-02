import type {
  AnalyticsProvider,
  ImageProvider,
  MusicProvider,
  Publisher,
  SubtitleProvider,
  ProviderDescriptor,
  ProviderKind,
  StockMediaProvider,
  VideoProvider,
  VideoRenderer,
  VoiceProvider,
} from './types';
import { ProviderNotConnectedError } from './types';

/**
 * The honest default for every media provider.
 *
 * These never return placeholder media. They throw, the capability handler
 * catches it, and the workflow blocks with the exact reason and the
 * environment variables needed to fix it.
 */
function descriptor(kind: ProviderKind, requiredEnv: string[]): ProviderDescriptor {
  return {
    kind,
    name: 'Not configured',
    connected: false,
    requiredEnv,
    capabilities: [],
    pricingNote: '',
    simulated: false,
  };
}

class Unconnected {
  constructor(
    readonly descriptor: ProviderDescriptor,
    private kind: ProviderKind,
    private requiredEnv: string[],
  ) {}

  isConnected(): boolean {
    return false;
  }

  async testConnection() {
    return {
      ok: false,
      detail: `Not connected. Set ${this.requiredEnv.join(' and ')} on the server.`,
    };
  }

  protected refuse(): never {
    throw new ProviderNotConnectedError(this.kind, this.requiredEnv);
  }
}

export class UnconnectedVoiceProvider extends Unconnected implements VoiceProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('voice', requiredEnv), 'voice', requiredEnv);
  }
  async listVoices() {
    return [];
  }
  async generateSpeech(): Promise<never> {
    return this.refuse();
  }
  async getGenerationStatus(): Promise<never> {
    return this.refuse();
  }
  estimateCost(): number {
    return 0;
  }
}

export class UnconnectedImageProvider extends Unconnected implements ImageProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('image', requiredEnv), 'image', requiredEnv);
  }
  async generateImage(): Promise<never> {
    return this.refuse();
  }
  async getStatus(): Promise<never> {
    return this.refuse();
  }
  estimateCost(): number {
    return 0;
  }
}

export class UnconnectedVideoProvider extends Unconnected implements VideoProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('video', requiredEnv), 'video', requiredEnv);
  }
  async generateVideo(): Promise<never> {
    return this.refuse();
  }
  async getStatus(): Promise<never> {
    return this.refuse();
  }
  estimateCost(): number {
    return 0;
  }
}

export class UnconnectedStockProvider extends Unconnected implements StockMediaProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('stock', requiredEnv), 'stock', requiredEnv);
  }
  async search() {
    return [];
  }
  async fetchAsset(): Promise<never> {
    return this.refuse();
  }
}

export class UnconnectedRenderer extends Unconnected implements VideoRenderer {
  constructor(requiredEnv: string[]) {
    super(descriptor('renderer', requiredEnv), 'renderer', requiredEnv);
  }
  async renderTimeline(): Promise<never> {
    return this.refuse();
  }
  async getRenderStatus(): Promise<never> {
    return this.refuse();
  }
  async cancelRender(): Promise<void> {
    /* nothing to cancel */
  }
}

/* ------------------------------------------------------------------ */
/* Studio providers                                                    */
/* ------------------------------------------------------------------ */

export class UnconnectedMusicProvider extends Unconnected implements MusicProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('music', requiredEnv), 'music', requiredEnv);
  }
  async generateMusic(): Promise<never> {
    return this.refuse();
  }
  estimateCost(): number {
    return 0;
  }
}

export class UnconnectedSubtitleProvider extends Unconnected implements SubtitleProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('subtitles', requiredEnv), 'subtitles', requiredEnv);
  }
  async generateSubtitles(): Promise<never> {
    return this.refuse();
  }
  estimateCost(): number {
    return 0;
  }
}

/**
 * The most important refusal in the system.
 *
 * Publishing is the one irreversible act. An unconnected publisher must never
 * return a plausible-looking result, because a fabricated external id would be
 * written to `published_external_id` and the workspace would believe a video is
 * live on a channel that has never heard of it.
 */
export class UnconnectedPublisher extends Unconnected implements Publisher {
  constructor(requiredEnv: string[]) {
    super(descriptor('publisher', requiredEnv), 'publisher', requiredEnv);
  }
  async publish(): Promise<never> {
    return this.refuse();
  }
  async unpublish(): Promise<never> {
    return this.refuse();
  }
}

export class UnconnectedAnalyticsProvider extends Unconnected implements AnalyticsProvider {
  constructor(requiredEnv: string[]) {
    super(descriptor('analytics', requiredEnv), 'analytics', requiredEnv);
  }
  async collectAnalytics(): Promise<never> {
    return this.refuse();
  }
}
