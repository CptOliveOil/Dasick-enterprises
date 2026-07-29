import 'server-only';
import path from 'node:path';
import {
  readOutput,
  renderPlaceholderImage,
  renderSilentAudio,
  withTempDir,
} from '@/lib/media/ffmpeg';
import type {
  ImageProvider,
  ImageRequest,
  ProducedMedia,
  ProviderDescriptor,
  ProviderKind,
  SpeechRequest,
  StockMediaProvider,
  StockResult,
  VideoClipRequest,
  VideoProvider,
  VoiceOption,
  VoiceProvider,
} from './types';

/**
 * Demo Mode providers.
 *
 * These produce *real files* — a genuinely playable silent audio track, a
 * genuinely viewable image — but every one is stamped SIMULATED in the picture
 * itself and flagged `simulated: true` on the asset record. Nothing here may
 * run outside Demo Mode.
 */

const PALETTE = ['#101a2e', '#1c1430', '#2e1810', '#0f2420', '#241a0f', '#1a1020'];

function descriptor(kind: ProviderKind, capabilities: string[]): ProviderDescriptor {
  return {
    kind,
    name: 'Simulated (Demo Mode)',
    connected: true,
    requiredEnv: [],
    capabilities,
    pricingNote: 'Free — produces clearly-marked placeholder media only.',
    simulated: true,
  };
}

class SimulatedBase {
  isConnected(): boolean {
    return true;
  }
  async testConnection() {
    return {
      ok: true,
      detail: 'Demo Mode placeholder provider. Produces labelled simulated media only.',
    };
  }
}

/** Narration becomes silence of the right length, so timings stay truthful. */
export class SimulatedVoiceProvider extends SimulatedBase implements VoiceProvider {
  readonly descriptor = descriptor('voice', ['speech']);

  async listVoices(): Promise<VoiceOption[]> {
    return [
      {
        id: 'simulated-narrator',
        name: 'Simulated Narrator',
        description: 'Demo Mode placeholder — generates silence of the correct duration.',
        language: 'en-GB',
      },
    ];
  }

  async generateSpeech(request: SpeechRequest): Promise<ProducedMedia> {
    // 155 words per minute, matching the script duration estimate.
    const words = request.text.trim().split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(2, Math.round((words / 155) * 60) / Math.max(0.5, request.speed));

    return withTempDir(async (dir) => {
      const output = path.join(dir, 'narration.m4a');
      await renderSilentAudio(seconds, output);
      return {
        data: await readOutput(output),
        mimeType: 'audio/mp4',
        extension: 'm4a',
        durationSeconds: seconds,
        cost: 0,
        simulated: true,
        metadata: { note: 'Silent placeholder — no speech was synthesised.' },
      };
    });
  }

  async getGenerationStatus() {
    return { status: 'completed', progress: 100 };
  }

  estimateCost(): number {
    return 0;
  }
}

export class SimulatedImageProvider extends SimulatedBase implements ImageProvider {
  readonly descriptor = descriptor('image', ['text-to-image']);

  async generateImage(request: ImageRequest): Promise<ProducedMedia> {
    const background = PALETTE[hash(request.prompt) % PALETTE.length]!;
    return withTempDir(async (dir) => {
      const output = path.join(dir, 'image.png');
      await renderPlaceholderImage({
        width: request.width,
        height: request.height,
        background,
        lines: [
          { text: 'SIMULATED ASSET', size: Math.round(request.height * 0.055), colour: '#f5a524' },
          { text: truncate(request.prompt, 68), size: Math.round(request.height * 0.032) },
          {
            text: request.purpose === 'thumbnail' ? 'Thumbnail placeholder' : 'Scene placeholder',
            size: Math.round(request.height * 0.026),
            colour: '#94a3b8',
          },
        ],
        outputPath: output,
      });
      return {
        data: await readOutput(output),
        mimeType: 'image/png',
        extension: 'png',
        width: request.width,
        height: request.height,
        cost: 0,
        simulated: true,
        metadata: { prompt: request.prompt },
      };
    });
  }

  async getStatus() {
    return { status: 'completed', progress: 100 };
  }

  estimateCost(): number {
    return 0;
  }
}

/**
 * Simulated video clips are still images. Producing a moving clip and calling
 * it generated video would misrepresent what happened; the renderer applies its
 * own Ken Burns motion to stills, which is visible and honest.
 */
export class SimulatedVideoProvider extends SimulatedBase implements VideoProvider {
  readonly descriptor = descriptor('video', ['text-to-video']);
  private images = new SimulatedImageProvider();

  async generateVideo(request: VideoClipRequest): Promise<ProducedMedia> {
    const produced = await this.images.generateImage({
      prompt: request.prompt,
      width: request.width,
      height: request.height,
      purpose: 'scene',
    });
    return {
      ...produced,
      durationSeconds: request.durationSeconds,
      metadata: {
        ...produced.metadata,
        note: 'Simulated video: a still placeholder, animated by the renderer.',
      },
    };
  }

  async getStatus() {
    return { status: 'completed', progress: 100 };
  }

  estimateCost(): number {
    return 0;
  }
}

export class SimulatedStockProvider extends SimulatedBase implements StockMediaProvider {
  readonly descriptor = descriptor('stock', ['search']);
  private images = new SimulatedImageProvider();

  async search(query: string, kind: 'image' | 'video'): Promise<StockResult[]> {
    return [
      {
        id: `simulated-${hash(query)}`,
        previewUrl: '',
        description: `Simulated stock result for "${query}"`,
        licence: 'Demo Mode placeholder — not a real licensed asset.',
        width: 1920,
        height: 1080,
        kind,
      },
    ];
  }

  async fetchAsset(result: StockResult): Promise<ProducedMedia> {
    return this.images.generateImage({
      prompt: result.description,
      width: result.width,
      height: result.height,
      purpose: 'scene',
    });
  }
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
