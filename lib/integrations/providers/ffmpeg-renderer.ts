import 'server-only';
import {
  escapeFilterPath,
  ffmpegAvailable,
  runFfmpeg,
} from '@/lib/media/ffmpeg';
import { RENDER_PRESETS } from './types';
import type {
  ProviderDescriptor,
  RenderRequest,
  RenderResult,
  VideoRenderer,
} from './types';

/**
 * Local server-side renderer built on the bundled static ffmpeg.
 *
 * It handles what a faceless documentary actually needs — stills and clips with
 * Ken Burns motion, crossfades, narration, ducked background music and burned-in
 * text — and nothing more. It is not a general-purpose editor.
 */
export class FfmpegRenderer implements VideoRenderer {
  readonly descriptor: ProviderDescriptor = {
    kind: 'renderer',
    name: 'Local ffmpeg',
    connected: ffmpegAvailable(),
    requiredEnv: [],
    capabilities: [
      'stills and clips',
      'ken burns',
      'crossfade',
      'narration',
      'background music',
      'burned-in captions',
    ],
    pricingNote: 'Free — renders on this server, no external spend.',
    simulated: false,
  };

  /** Progress is tracked per job so the UI can poll a long render. */
  private progress = new Map<string, number>();
  private cancelled = new Set<string>();

  isConnected(): boolean {
    return ffmpegAvailable();
  }

  async testConnection() {
    if (!ffmpegAvailable()) {
      return { ok: false, detail: 'The bundled ffmpeg binary could not be resolved.' };
    }
    try {
      // `-version` prints to stdout, not stderr.
      const { stdout, stderr } = await runFfmpeg(['-version'], { timeoutMs: 15_000 });
      const version = (stdout || stderr).split('\n')[0]?.trim() || 'ffmpeg available';
      return { ok: true, detail: version.slice(0, 140) };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  async getRenderStatus(jobId: string) {
    if (this.cancelled.has(jobId)) return { status: 'cancelled', progress: 0 };
    const value = this.progress.get(jobId) ?? 0;
    return { status: value >= 100 ? 'completed' : 'processing', progress: value };
  }

  async cancelRender(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
  }

  async renderTimeline(request: RenderRequest): Promise<RenderResult> {
    if (!ffmpegAvailable()) {
      throw new Error('ffmpeg is not available, so nothing can be rendered.');
    }
    if (request.clips.length === 0) {
      throw new Error('The timeline has no clips to render.');
    }

    this.progress.set(request.jobId, 5);
    const args: string[] = [];
    const filters: string[] = [];

    // --- Inputs -----------------------------------------------------------
    request.clips.forEach((clip) => {
      if (clip.kind === 'image' && clip.animation !== 'none') {
        // A single frame, deliberately not looped. `zoompan` generates `d`
        // output frames from each *input* frame, so a looped four-second still
        // at 30fps would hand it 120 frames and get 14,400 back — an eight
        // minute clip where four seconds were wanted. Feeding it one frame and
        // letting it own the duration is the only construction that produces
        // the length that was asked for.
        args.push('-i', clip.filePath);
      } else if (clip.kind === 'image') {
        args.push('-loop', '1', '-t', clip.durationSeconds.toFixed(3), '-i', clip.filePath);
      } else {
        args.push('-t', clip.durationSeconds.toFixed(3), '-i', clip.filePath);
      }
    });

    const narrationIndex = request.narrationPath ? request.clips.length : -1;
    if (request.narrationPath) args.push('-i', request.narrationPath);

    const musicIndex = request.musicPath
      ? request.clips.length + (request.narrationPath ? 1 : 0)
      : -1;
    if (request.musicPath) args.push('-stream_loop', '-1', '-i', request.musicPath);

    // --- Visual chain -----------------------------------------------------
    const { width, height, fps } = request;
    request.clips.forEach((clip, i) => {
      const frames = Math.max(1, Math.round(clip.durationSeconds * fps));
      const motion = kenBurns(clip.animation, frames, width, height, fps);
      // `fps` belongs *after* the motion filter, or inside it — never before.
      // zoompan multiplies frames, so rate-limiting first and zooming second
      // multiplies the clip's length by its own frame count.
      const rate = motion ? '' : `,fps=${fps}`;
      filters.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1${rate}${motion}[v${i}]`,
      );
    });

    // Crossfades are chained pairwise; `offset` is cumulative minus the
    // overlaps already consumed.
    let current = 'v0';
    let elapsed = request.clips[0]!.durationSeconds;
    for (let i = 1; i < request.clips.length; i += 1) {
      const clip = request.clips[i]!;
      const previous = request.clips[i - 1]!;
      const useFade = clip.transition !== 'cut';
      const fade = useFade
        ? Math.min(0.8, previous.durationSeconds / 2, clip.durationSeconds / 2)
        : 0;
      const offset = Math.max(0, elapsed - fade);
      const label = `x${i}`;

      if (useFade && fade > 0.05) {
        filters.push(
          `[${current}][v${i}]xfade=transition=${xfadeName(clip.transition)}:duration=${fade.toFixed(
            2,
          )}:offset=${offset.toFixed(3)}[${label}]`,
        );
        elapsed = offset + fade + clip.durationSeconds - fade;
      } else {
        filters.push(`[${current}][v${i}]concat=n=2:v=1:a=0[${label}]`);
        elapsed += clip.durationSeconds;
      }
      current = label;
    }

    if (request.assPath) {
      filters.push(`[${current}]subtitles=${escapeFilterPath(request.assPath)}[vout]`);
      current = 'vout';
    }

    // --- Audio chain ------------------------------------------------------
    let audioLabel: string | null = null;
    if (narrationIndex >= 0 && musicIndex >= 0) {
      filters.push(`[${narrationIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo[na]`);
      filters.push(
        `[${musicIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
          `volume=${request.musicVolume.toFixed(3)},` +
          `afade=t=in:st=0:d=${Math.max(0, request.musicFadeIn).toFixed(2)},` +
          `atrim=0:${elapsed.toFixed(3)},` +
          `afade=t=out:st=${Math.max(0, elapsed - request.musicFadeOut).toFixed(3)}:d=${Math.max(
            0.1,
            request.musicFadeOut,
          ).toFixed(2)}[mu]`,
      );
      // `duration=first` keeps the looped music from extending the video.
      filters.push(`[na][mu]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
      audioLabel = 'aout';
    } else if (narrationIndex >= 0) {
      filters.push(
        `[${narrationIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo[aout]`,
      );
      audioLabel = 'aout';
    } else if (musicIndex >= 0) {
      filters.push(
        `[${musicIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
          `volume=${request.musicVolume.toFixed(3)},atrim=0:${elapsed.toFixed(3)}[aout]`,
      );
      audioLabel = 'aout';
    }

    this.progress.set(request.jobId, 20);
    if (this.cancelled.has(request.jobId)) throw new Error('Render cancelled.');

    args.push('-filter_complex', filters.join(';'));
    args.push('-map', `[${current}]`);
    if (audioLabel) args.push('-map', `[${audioLabel}]`);

    const preset = RENDER_PRESETS[request.preset ?? 'standard'];
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      preset.speed,
      '-crf',
      String(preset.crf),
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(fps),
      '-movflags',
      '+faststart',
    );
    if (audioLabel) args.push('-c:a', 'aac', '-b:a', preset.audioBitrate);
    args.push('-t', elapsed.toFixed(3), request.outputPath);

    request.onProgress?.(25);
    const result = await runFfmpeg(args, { timeoutMs: 20 * 60_000 });
    this.progress.set(request.jobId, 100);
    request.onProgress?.(100);

    return {
      outputPath: request.outputPath,
      durationMs: result.durationMs,
      // Only the tail is kept: enough to diagnose a failure, not a wall of text.
      log: result.stderr.split('\n').slice(-25).join('\n'),
    };
  }
}

/**
 * Ken Burns via `zoompan`.
 *
 * `d` is the number of output frames generated *per input frame*, which is the
 * trap in this filter: applied to a looped still it multiplies rather than
 * sets the duration. The caller feeds it a single frame for exactly that
 * reason, and the rate is set here so the clip lasts `frames / fps`.
 *
 * Motion is deliberately slight — a 12% zoom across the whole shot. A
 * documentary wants the picture to breathe, not to lurch.
 */
function kenBurns(
  animation: RenderRequest['clips'][number]['animation'],
  frames: number,
  width: number,
  height: number,
  fps: number,
): string {
  if (animation === 'none') return '';
  // Output size and rate are set on the filter itself, so the clip's length is
  // exactly `frames / fps` regardless of what the input frame rate was.
  const size = `:s=${width}x${height}:fps=${fps}`;
  const step = 0.0009;
  switch (animation) {
    case 'zoom_in':
      return `,zoompan=z='min(zoom+${step},1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${size}`;
    case 'zoom_out':
      return `,zoompan=z='if(lte(zoom,1.0),1.12,max(1.001,zoom-${step}))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${size}`;
    case 'pan_left':
      return `,zoompan=z=1.12:d=${frames}:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'${size}`;
    case 'pan_right':
      return `,zoompan=z=1.12:d=${frames}:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'${size}`;
    default:
      return '';
  }
}

const XFADE_TRANSITIONS = new Set([
  'fade',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'dissolve',
  'fadeblack',
  'smoothleft',
  'smoothright',
]);

function xfadeName(transition: string): string {
  const normalised = transition.toLowerCase().replace(/[\s_-]/g, '');
  return XFADE_TRANSITIONS.has(normalised) ? normalised : 'fade';
}
