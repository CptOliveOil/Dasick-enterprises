import 'server-only';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Resolves the bundled static ffmpeg binary. Returns null when it is missing,
 * which is what makes the renderer honestly report itself as unavailable
 * rather than failing halfway through a render.
 */
let cachedPath: string | null | undefined;

export function ffmpegPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;
  cachedPath = resolveFfmpeg();
  return cachedPath;
}

function resolveFfmpeg(): string | null {
  // An explicit override wins, for environments with a system ffmpeg.
  const override = process.env.FFMPEG_PATH?.trim();
  if (override && existsSync(override)) return override;

  const candidates: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resolved = require('ffmpeg-static') as string | null;
    if (typeof resolved === 'string') candidates.push(resolved);
  } catch {
    /* not installed — fall through to the path candidates */
  }
  // A bundler may rewrite the path above into the build output, so also look
  // where the package actually installs.
  candidates.push(
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  );

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function ffmpegAvailable(): boolean {
  return ffmpegPath() !== null;
}

export interface FfmpegResult {
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/** Runs ffmpeg. Errors carry the tail of stderr so a failure can be diagnosed. */
export async function runFfmpeg(
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<FfmpegResult> {
  const binary = ffmpegPath();
  if (!binary) throw new FfmpegError('ffmpeg is not available in this environment.', '');

  const began = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-hide_banner', '-y', ...args], {
      timeout: options.timeoutMs ?? 10 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
      durationMs: Date.now() - began,
    };
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '');
    const tail = stderr.trim().split('\n').slice(-3).join(' ').trim();
    // A spawn failure (missing or non-executable binary) produces no stderr at
    // all, so fall back to the error itself rather than reporting nothing.
    const detail = tail || (error as Error).message || 'no output';
    throw new FfmpegError(`ffmpeg failed: ${detail.slice(0, 400)}`, stderr);
  }
}

export interface ProbeResult {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
}

/**
 * Measures a media file. ffprobe is not shipped with ffmpeg-static, so this
 * reads ffmpeg's own stream report — the numbers are still measured from the
 * file rather than assumed.
 */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const binary = ffmpegPath();
  if (!binary) {
    return {
      durationSeconds: null,
      width: null,
      height: null,
      hasAudioTrack: false,
      hasVideoTrack: false,
    };
  }

  let stderr = '';
  try {
    // `-i` with no output makes ffmpeg print the stream summary and exit non-zero.
    await execFileAsync(binary, ['-hide_banner', '-i', filePath], { maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    stderr = String((error as { stderr?: string }).stderr ?? '');
  }

  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  const size = stderr.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);

  return {
    durationSeconds: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    hasAudioTrack: /Stream #\d+:\d+.*: Audio:/.test(stderr),
    hasVideoTrack: /Stream #\d+:\d+.*: Video:/.test(stderr),
  };
}

/** Scratch directory for one render. Always removed, including on failure. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-render-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Renders a solid-colour still with an ASS text overlay.
 *
 * This static build has no `drawtext` filter, so all text — placeholders,
 * on-screen text and captions — goes through libass. One text path, not two.
 */
export async function renderPlaceholderImage(options: {
  width: number;
  height: number;
  background: string;
  lines: { text: string; size: number; colour?: string }[];
  outputPath: string;
}): Promise<void> {
  const { width, height, background, lines, outputPath } = options;
  await withTempDir(async (dir) => {
    const assPath = path.join(dir, 'text.ass');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(assPath, buildStillAss(width, height, lines));
    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=c=${background}:s=${width}x${height}:d=1`,
      '-vf',
      `subtitles=${escapeFilterPath(assPath)}`,
      '-frames:v',
      '1',
      outputPath,
    ]);
  });
}

/** Silent narration of a known length. Used only as a labelled Demo placeholder. */
export async function renderSilentAudio(
  seconds: number,
  outputPath: string,
): Promise<void> {
  await runFfmpeg([
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=44100:cl=stereo',
    '-t',
    String(Math.max(1, seconds)),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outputPath,
  ]);
}

export async function readOutput(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/**
 * ffmpeg's filter syntax treats `:` and `\` specially inside filter arguments,
 * so any path handed to a filter has to be escaped.
 */
export function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function buildStillAss(
  width: number,
  height: number,
  lines: { text: string; size: number; colour?: string }[],
): string {
  const styles = lines
    .map(
      (line, i) =>
        `Style: S${i},DejaVu Sans,${line.size},${toAssColour(line.colour ?? '#ffffff')},&H00000000,&H80000000,1,2,0,5,60,60,${60 + i * 10},1`,
    )
    .join('\n');

  // Stack the lines vertically around the centre.
  const events = lines
    .map((line, i) => {
      const offset = (i - (lines.length - 1) / 2) * (line.size * 1.5);
      const y = Math.round(height / 2 + offset);
      return `Dialogue: 0,0:00:00.00,0:00:10.00,S${i},,0,0,0,,{\\pos(${Math.round(width / 2)},${y})}${escapeAssText(line.text)}`;
    })
    .join('\n');

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    events,
    '',
  ].join('\n');
}

/** ASS colours are &HBBGGRR, the reverse of hex. */
export function toAssColour(hex: string): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export function escapeAssText(text: string): string {
  return text.replace(/\r?\n/g, '\\N').replace(/\{/g, '(').replace(/\}/g, ')');
}
