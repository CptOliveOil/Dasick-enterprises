import type { SubtitleCue } from '@/lib/integrations/providers/types';

/**
 * Caption files, and the rules that make them usable.
 *
 * Two formats because two consumers: YouTube takes either, but SRT is what
 * every editor and every player understands, and VTT is what a browser
 * `<track>` needs. Producing one and claiming the other exists is the kind of
 * gap nobody notices until upload day.
 *
 * The validation matters more than the formatting. A caption track that
 * overlaps itself, or that runs past the end of the audio, is worse than none:
 * it renders, it uploads, and it looks broken to every viewer while looking
 * fine in every log.
 */

const CRLF = '\r\n';

function clock(seconds: number, msSeparator: ',' | '.'): string {
  const clamped = Math.max(0, seconds);
  const whole = Math.floor(clamped);
  const ms = Math.round((clamped - whole) * 1000);
  const h = String(Math.floor(whole / 3600)).padStart(2, '0');
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
  const s = String(whole % 60).padStart(2, '0');
  return `${h}:${m}:${s}${msSeparator}${String(ms).padStart(3, '0')}`;
}

/**
 * SubRip. CRLF line endings and a blank line between cues, because a
 * surprising number of players are strict about both.
 */
export function toSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((cue, index) =>
        [
          String(index + 1),
          `${clock(cue.startSeconds, ',')} --> ${clock(cue.endSeconds, ',')}`,
          cue.text,
        ].join(CRLF),
      )
      .join(CRLF + CRLF) + CRLF + CRLF
  );
}

export function toVtt(cues: SubtitleCue[]): string {
  return [
    'WEBVTT',
    '',
    ...cues.flatMap((cue, index) => [
      String(index + 1),
      `${clock(cue.startSeconds, '.')} --> ${clock(cue.endSeconds, '.')}`,
      cue.text,
      '',
    ]),
  ].join('\n');
}

export interface CueProblem {
  index: number;
  problem: string;
}

/** Minimum a caption can sit on screen and still be readable. */
const MIN_CUE_SECONDS = 0.7;
/** Longer than this and a caption has outstayed its line. */
const MAX_CUE_SECONDS = 7;
const MAX_LINE_LENGTH = 45;

/**
 * Everything wrong with a caption track, or an empty list.
 *
 * Checked against the *real* audio duration, so a track produced from an
 * estimate and a track produced from alignment are held to the same standard.
 */
export function validateCues(cues: SubtitleCue[], audioDuration: number | null): CueProblem[] {
  const problems: CueProblem[] = [];

  cues.forEach((cue, index) => {
    if (cue.endSeconds <= cue.startSeconds) {
      problems.push({ index, problem: 'ends before it starts' });
    }
    const length = cue.endSeconds - cue.startSeconds;
    if (length > 0 && length < MIN_CUE_SECONDS) {
      problems.push({ index, problem: `only ${length.toFixed(2)}s on screen` });
    }
    if (length > MAX_CUE_SECONDS) {
      problems.push({ index, problem: `${length.toFixed(1)}s on screen, too long to read as one card` });
    }
    if (cue.text.trim().length === 0) {
      problems.push({ index, problem: 'is empty' });
    }
    for (const line of cue.text.split('\n')) {
      if (line.length > MAX_LINE_LENGTH) {
        problems.push({ index, problem: `has a ${line.length}-character line` });
      }
    }
    const previous = cues[index - 1];
    if (previous && cue.startSeconds < previous.endSeconds) {
      problems.push({ index, problem: 'overlaps the previous cue' });
    }
    if (audioDuration !== null && cue.startSeconds > audioDuration) {
      problems.push({ index, problem: 'starts after the audio has ended' });
    }
  });

  return problems;
}

/**
 * Fits a caption track to the audio that was actually produced.
 *
 * Cues are estimated from the script before the narration exists, so they are
 * always a little wrong: a voice that reads faster or slower than 155 words a
 * minute drifts further with every cue until the captions are a paragraph
 * behind. Scaling against the measured duration fixes the accumulation, which
 * is the part a viewer notices.
 *
 * It cannot fix *local* drift — a pause the narrator took that the script did
 * not predict. Only word timings from the voice provider can, which is why
 * `aligned` is recorded separately and why quality control reports estimated
 * captions as provisional.
 */
export function fitToAudio(cues: SubtitleCue[], audioDuration: number | null): SubtitleCue[] {
  if (!audioDuration || cues.length === 0) return cues;
  const estimated = cues[cues.length - 1]!.endSeconds;
  if (estimated <= 0) return cues;

  const scale = audioDuration / estimated;
  // A scale near 1 is noise; rescaling by it would churn the file for nothing.
  if (Math.abs(scale - 1) < 0.02) return cues;

  return cues.map((cue) => ({
    startSeconds: Number((cue.startSeconds * scale).toFixed(3)),
    endSeconds: Number(Math.min(audioDuration, cue.endSeconds * scale).toFixed(3)),
    text: cue.text,
  }));
}

/**
 * Removes overlaps by nudging each cue to start where the last one ended.
 *
 * Applied after scaling, because rounding can produce a one-millisecond overlap
 * that no viewer would see and every validator would report.
 */
export function separate(cues: SubtitleCue[]): SubtitleCue[] {
  const out: SubtitleCue[] = [];
  for (const cue of cues) {
    const previous = out[out.length - 1];
    if (previous && cue.startSeconds < previous.endSeconds) {
      const start = previous.endSeconds;
      out.push({
        ...cue,
        startSeconds: start,
        endSeconds: Math.max(start + MIN_CUE_SECONDS, cue.endSeconds),
      });
    } else {
      out.push(cue);
    }
  }
  return out;
}
