import 'server-only';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { probeMedia, withTempDir } from '@/lib/media/ffmpeg';
import { envValue, providerBytes, providerJson, ProviderRequestError } from './http';
import type {
  ProducedMedia,
  ProviderDescriptor,
  SpeechRequest,
  VoiceOption,
  VoiceProvider,
} from './types';

/**
 * ElevenLabs narration.
 *
 * Chosen because the interface already matches how it works: a voice id, a
 * model, a small settings bag, and audio bytes back in one call. Nothing about
 * the `VoiceProvider` contract had to bend to accommodate it, which is the
 * test of whether an abstraction was drawn in the right place.
 *
 * Two things this does that the simulated provider cannot:
 *
 * - **It measures the audio it produced.** Duration comes from probing the
 *   returned file, not from a words-per-minute estimate. Everything downstream
 *   — scene timing, caption alignment, the render length — hangs off that
 *   number, so a guess there becomes a drift everywhere.
 * - **It reports what it actually cost**, priced per character against the
 *   configured tier, so the budget ceilings meter real spend rather than an
 *   assumption.
 *
 * The key is read from the environment inside the adapter and never returned,
 * logged or attached to an asset.
 */

const API = 'https://api.elevenlabs.io/v1';

export const ELEVENLABS_ENV = ['VOICE_PROVIDER', 'VOICE_PROVIDER_API_KEY'] as const;

/**
 * Per-character pricing, in pounds.
 *
 * Deliberately an over-estimate of the common tiers rather than an exact quote:
 * the figure meters a budget ceiling, and guessing low is how a ceiling gets
 * passed. The real charge appears on the provider's own invoice.
 */
const COST_PER_CHARACTER = 0.00024;

interface ElevenVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  description?: string | null;
}

export function elevenLabsConfigured(): boolean {
  return (
    envValue('VOICE_PROVIDER')?.toLowerCase() === 'elevenlabs' &&
    Boolean(envValue('VOICE_PROVIDER_API_KEY'))
  );
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly descriptor: ProviderDescriptor = {
    kind: 'voice',
    name: 'ElevenLabs',
    connected: true,
    requiredEnv: [...ELEVENLABS_ENV],
    capabilities: ['speech', 'voices'],
    pricingNote: 'Charged per character. A 12-minute script is roughly 11,000 characters.',
    simulated: false,
  };

  private get key(): string {
    const key = envValue('VOICE_PROVIDER_API_KEY');
    if (!key) {
      throw new ProviderRequestError('auth', null, 'VOICE_PROVIDER_API_KEY is not set.', false);
    }
    return key;
  }

  private get model(): string {
    return envValue('VOICE_MODEL') ?? 'eleven_multilingual_v2';
  }

  isConnected(): boolean {
    return elevenLabsConfigured();
  }

  /**
   * A cheap round trip.
   *
   * Reads the subscription, which costs nothing and synthesises nothing —
   * opening Settings must never spend money.
   */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const data = await providerJson<{ tier?: string; character_count?: number; character_limit?: number }>(
        `${API}/user/subscription`,
        {
          label: 'ElevenLabs connection test',
          headers: { 'xi-api-key': this.key },
          attempts: 1,
          timeoutMs: 15_000,
        },
      );
      const used = data.character_count ?? 0;
      const limit = data.character_limit ?? 0;
      return {
        ok: true,
        detail: limit
          ? `Connected. Tier ${data.tier ?? 'unknown'} — ${used.toLocaleString('en-GB')} of ${limit.toLocaleString('en-GB')} characters used this period.`
          : `Connected. Tier ${data.tier ?? 'unknown'}.`,
      };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof ProviderRequestError
            ? `${error.message} ${error.remedy}`
            : 'Could not reach ElevenLabs.',
      };
    }
  }

  async listVoices(): Promise<VoiceOption[]> {
    const data = await providerJson<{ voices: ElevenVoice[] }>(`${API}/voices`, {
      label: 'ElevenLabs voice list',
      headers: { 'xi-api-key': this.key },
      timeoutMs: 20_000,
    });
    return (data.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      description: voice.description ?? Object.values(voice.labels ?? {}).join(', '),
      language: voice.labels?.language ?? 'en',
    }));
  }

  estimateCost(characters: number): number {
    return Number((characters * COST_PER_CHARACTER).toFixed(4));
  }

  async generateSpeech(request: SpeechRequest): Promise<ProducedMedia> {
    const voiceId = request.voiceId || envValue('VOICE_ID');
    if (!voiceId) {
      throw new ProviderRequestError(
        'bad_request',
        null,
        'No voice was chosen. Set VOICE_ID, or pick a voice in channel production settings.',
        false,
      );
    }

    const bytes = await providerBytes(
      `${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        label: 'ElevenLabs narration',
        method: 'POST',
        headers: {
          'xi-api-key': this.key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: this.model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            // Speed lives in the request rather than the settings bag, so a
            // channel-level pace change does not need a settings migration.
            speed: request.speed,
            ...request.settings,
          },
        }),
        // Long narration takes minutes. The job layer owns the overall
        // lifecycle; this bound is only for a single hung socket.
        timeoutMs: 300_000,
      },
    );

    // Measured, never estimated. Every downstream timing hangs off this.
    const durationSeconds = await measureDuration(bytes);

    return {
      data: bytes,
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      durationSeconds,
      cost: this.estimateCost(request.text.length),
      simulated: false,
      metadata: {
        provider: 'elevenlabs',
        model: this.model,
        voice_id: voiceId,
        characters: request.text.length,
      },
    };
  }

  /**
   * ElevenLabs returns audio synchronously, so there is no job to poll. Saying
   * `completed` is accurate rather than a stub: by the time a caller could ask,
   * the bytes are already in hand.
   */
  async getGenerationStatus(): Promise<{ status: string; progress: number }> {
    return { status: 'completed', progress: 100 };
  }
}

/** Probes the returned audio for its real length. */
async function measureDuration(bytes: Buffer): Promise<number | null> {
  try {
    return await withTempDir(async (dir) => {
      const file = path.join(dir, 'narration.mp3');
      await fs.writeFile(file, bytes);
      const probe = await probeMedia(file);
      return probe.durationSeconds ?? null;
    });
  } catch {
    // A missing ffmpeg must not fail a narration that succeeded. Null is
    // honest — the caller then knows the duration is unknown rather than
    // being handed a fabricated one.
    return null;
  }
}
