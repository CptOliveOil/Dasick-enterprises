import 'server-only';
import { envValue, providerJson, ProviderRequestError } from './http';
import type {
  ImageProvider,
  ImageRequest,
  ProducedMedia,
  ProviderDescriptor,
} from './types';

/**
 * OpenAI image generation, for documentary stills and thumbnail candidates.
 *
 * Chosen because it returns 1536×1024 — a genuine 3:2 that crops cleanly to
 * 16:9 — synchronously, as base64, with an explicit moderation refusal rather
 * than a silent substitution. A provider that quietly returns *something* when
 * it dislikes a prompt is the worst kind for this pipeline, because the
 * placeholder ends up in the render.
 *
 * Scene stills and thumbnails stay separate use cases. They want different
 * shapes, different quality tiers and different prompt discipline, and
 * `request.purpose` carries that distinction through rather than having the
 * caller guess from the dimensions.
 */

const API = 'https://api.openai.com/v1/images/generations';

export const OPENAI_IMAGE_ENV = ['IMAGE_PROVIDER', 'IMAGE_PROVIDER_API_KEY'] as const;

/**
 * Per-image pricing, in pounds, erring high.
 *
 * Thumbnails are generated at the higher quality tier because they are the
 * single most consequential image in the video; scene stills use standard.
 */
const COST = { scene: 0.035, thumbnail: 0.07 };

export function openAiImagesConfigured(): boolean {
  return (
    envValue('IMAGE_PROVIDER')?.toLowerCase() === 'openai' &&
    Boolean(envValue('IMAGE_PROVIDER_API_KEY'))
  );
}

/**
 * The nearest supported size to what was asked for.
 *
 * The API accepts a fixed set. Landscape requests become 1536×1024, which is
 * the only wide option and crops to 16:9 with room to spare; anything squarer
 * becomes 1024×1024.
 */
export function nearestSize(width: number, height: number): '1024x1024' | '1536x1024' | '1024x1536' {
  const ratio = width / Math.max(1, height);
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

export class OpenAiImageProvider implements ImageProvider {
  readonly descriptor: ProviderDescriptor = {
    kind: 'image',
    name: 'OpenAI Images',
    connected: true,
    requiredEnv: [...OPENAI_IMAGE_ENV],
    capabilities: ['scene_stills', 'thumbnails'],
    pricingNote: 'Charged per image. A 12-minute documentary typically needs 25–40 stills.',
    simulated: false,
  };

  private get key(): string {
    const key = envValue('IMAGE_PROVIDER_API_KEY');
    if (!key) {
      throw new ProviderRequestError('auth', null, 'IMAGE_PROVIDER_API_KEY is not set.', false);
    }
    return key;
  }

  private get model(): string {
    return envValue('IMAGE_MODEL') ?? 'gpt-image-1';
  }

  isConnected(): boolean {
    return openAiImagesConfigured();
  }

  /**
   * Verifies the key without generating anything.
   *
   * Listing models is a free call. Generating a test image would charge the
   * operator for opening a settings page, which is exactly the surprise this
   * whole system is built to avoid.
   */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      await providerJson<{ data: unknown[] }>('https://api.openai.com/v1/models', {
        label: 'OpenAI connection test',
        headers: { Authorization: `Bearer ${this.key}` },
        attempts: 1,
        timeoutMs: 15_000,
      });
      return { ok: true, detail: `Connected. Images will be generated with ${this.model}.` };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof ProviderRequestError
            ? `${error.message} ${error.remedy}`
            : 'Could not reach OpenAI.',
      };
    }
  }

  estimateCost(count: number): number {
    return Number((count * COST.scene).toFixed(4));
  }

  async generateImage(request: ImageRequest): Promise<ProducedMedia> {
    const purpose = request.purpose ?? 'scene';
    const size = nearestSize(request.width, request.height);

    const data = await providerJson<{
      data: { b64_json?: string; revised_prompt?: string }[];
      usage?: { total_tokens?: number };
    }>(API, {
      label: 'OpenAI image generation',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.style ? `${request.prompt}\n\nStyle: ${request.style}` : request.prompt,
        size,
        n: 1,
        // Thumbnails carry the click; stills only have to hold for a few
        // seconds behind narration.
        quality: purpose === 'thumbnail' ? 'high' : 'medium',
      }),
      timeoutMs: 180_000,
    });

    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) {
      // Never fall through to a placeholder. A missing image must stop the
      // step, so the operator sees a gap rather than a grey rectangle.
      throw new ProviderRequestError(
        'moderation',
        null,
        'The provider returned no image. This usually means the prompt was refused.',
        false,
      );
    }

    const [widthText, heightText] = size.split('x');
    return {
      data: Buffer.from(encoded, 'base64'),
      mimeType: 'image/png',
      extension: 'png',
      width: Number(widthText),
      height: Number(heightText),
      cost: purpose === 'thumbnail' ? COST.thumbnail : COST.scene,
      simulated: false,
      metadata: {
        provider: 'openai',
        model: this.model,
        purpose,
        size,
        revised_prompt: data.data?.[0]?.revised_prompt ?? null,
        // Generated originals, so the copyright step can classify provenance
        // without guessing from the provider name.
        provenance: 'generated_original',
      },
    };
  }

  /** Synchronous API — by the time a caller could poll, the bytes are in hand. */
  async getStatus(): Promise<{ status: string; progress: number }> {
    return { status: 'completed', progress: 100 };
  }
}
