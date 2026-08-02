import 'server-only';
import path from 'node:path';
import { readOutput, renderSilentAudio, withTempDir } from '@/lib/media/ffmpeg';
import type {
  AnalyticsDay,
  AnalyticsProvider,
  AnalyticsWindow,
  MusicProvider,
  MusicRequest,
  ProducedMedia,
  ProviderDescriptor,
  ProviderKind,
  PublishRequest,
  PublishResult,
  Publisher,
  SubtitleCue,
  SubtitleProvider,
  SubtitleRequest,
  SubtitleResult,
} from './types';

/**
 * Demo implementations of the studio providers.
 *
 * The rule these follow is the one the existing simulated providers follow:
 * produce something *structurally real* — a playable audio file, correctly
 * timed cues, a well-formed publish result — and mark it unmistakably as a
 * stand-in. Structure has to be real or the demo tests nothing; content must be
 * fake or the demo is a lie.
 *
 * The publisher is the sharp edge. It returns an id that is obviously not a
 * platform id and a URL that goes nowhere, because a demo that returns a
 * plausible YouTube id would put a fiction into `published_external_id`, and
 * every later step would treat the video as live.
 */

function descriptor(kind: ProviderKind, capabilities: string[]): ProviderDescriptor {
  return {
    kind,
    name: 'Simulated (Demo Mode)',
    connected: true,
    requiredEnv: [],
    capabilities,
    pricingNote: 'Free — nothing leaves this machine.',
    simulated: true,
  };
}

const ok = async () => ({ ok: true, detail: 'Simulated provider, always available.' });

/* ------------------------------------------------------------------ */

export class SimulatedMusicProvider implements MusicProvider {
  readonly descriptor = descriptor('music', ['generateMusic']);
  isConnected() {
    return true;
  }
  testConnection = ok;
  estimateCost() {
    return 0;
  }

  /** Silence of the right length: it mixes, it renders, it costs nothing. */
  async generateMusic(request: MusicRequest): Promise<ProducedMedia> {
    return withTempDir(async (dir) => {
      const output = path.join(dir, 'music.m4a');
      await renderSilentAudio(Math.max(1, Math.round(request.durationSeconds)), output);
      return {
        data: await readOutput(output),
        mimeType: 'audio/mp4',
        extension: 'm4a',
        durationSeconds: request.durationSeconds,
        cost: 0,
        simulated: true,
        metadata: { mood: request.mood, note: 'Silent placeholder, not music.' },
      };
    });
  }
}

/* ------------------------------------------------------------------ */

/** Narration pace, matching the rest of the pipeline. */
const WORDS_PER_MINUTE = 155;
/** Roughly the longest a caption should sit on screen. */
const MAX_CUE_SECONDS = 6;

/**
 * Cues estimated from the transcript rather than heard from the audio.
 *
 * `aligned: false` says so, and it matters downstream: estimated timings drift
 * against real narration, so the quality step treats them as provisional
 * instead of reporting a subtitle sync it never measured.
 */
export function estimateCues(transcript: string, lineLength: number): SubtitleCue[] {
  const sentences = transcript.match(/[^.!?]+[.!?]*\s*/g) ?? [transcript];
  const cues: SubtitleCue[] = [];
  let cursor = 0;

  for (const sentence of sentences) {
    const text = sentence.trim();
    if (!text) continue;
    for (const chunk of wrap(text, lineLength)) {
      const words = chunk.split(/\s+/).filter(Boolean).length;
      const seconds = Math.min(MAX_CUE_SECONDS, Math.max(1, (words / WORDS_PER_MINUTE) * 60));
      cues.push({ startSeconds: cursor, endSeconds: cursor + seconds, text: chunk });
      cursor += seconds;
    }
  }
  return cues;
}

function wrap(text: string, lineLength: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length > 0 && line.length + word.length + 1 > lineLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function toVtt(cues: SubtitleCue[]): string {
  const stamp = (seconds: number) => {
    const whole = Math.floor(seconds);
    const ms = Math.round((seconds - whole) * 1000);
    const h = String(Math.floor(whole / 3600)).padStart(2, '0');
    const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
    const s = String(whole % 60).padStart(2, '0');
    return `${h}:${m}:${s}.${String(ms).padStart(3, '0')}`;
  };
  return [
    'WEBVTT',
    '',
    ...cues.flatMap((cue, index) => [
      String(index + 1),
      `${stamp(cue.startSeconds)} --> ${stamp(cue.endSeconds)}`,
      cue.text,
      '',
    ]),
  ].join('\n');
}

export class SimulatedSubtitleProvider implements SubtitleProvider {
  readonly descriptor = descriptor('subtitles', ['generateSubtitles']);
  isConnected() {
    return true;
  }
  testConnection = ok;
  estimateCost() {
    return 0;
  }

  async generateSubtitles(request: SubtitleRequest): Promise<SubtitleResult> {
    const cues = estimateCues(request.transcript, request.lineLength);
    return { cues, vtt: toVtt(cues), aligned: false, cost: 0, simulated: true };
  }
}

/* ------------------------------------------------------------------ */

export class SimulatedPublisher implements Publisher {
  readonly descriptor = descriptor('publisher', ['publish']);
  isConnected() {
    return true;
  }
  testConnection = ok;

  async publish(request: PublishRequest): Promise<PublishResult> {
    // Deliberately not shaped like a real platform id. Anything that later
    // mistakes this for a live video is a bug, and it should be an obvious one.
    const externalId = `simulated-${Date.now().toString(36)}`;
    return {
      externalId,
      url: `about:blank#${externalId}`,
      visibility: request.visibility,
      cost: 0,
      simulated: true,
    };
  }

  async unpublish(): Promise<void> {
    /* Nothing was published. */
  }
}

/* ------------------------------------------------------------------ */

export class SimulatedAnalyticsProvider implements AnalyticsProvider {
  readonly descriptor = descriptor('analytics', ['collectAnalytics']);
  isConnected() {
    return true;
  }
  testConnection = ok;

  /**
   * Returns nothing, on purpose.
   *
   * Every other simulated provider fabricates *structure*; this one would have
   * to fabricate *results*, and those flow into Business Intelligence Memory
   * and from there into every future prompt. Invented view counts would teach
   * the workspace's own agents that imaginary videos performed well. An empty
   * window is honest: in Demo Mode, nobody watched anything.
   */
  async collectAnalytics(_window: AnalyticsWindow): Promise<AnalyticsDay[]> {
    return [];
  }
}
