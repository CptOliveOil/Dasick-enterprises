import type { TimelineItem } from '@/types/production';

/**
 * Whether a timeline is worth spending an encode on.
 *
 * Rendering is the most expensive step in the pipeline in wall-clock time — a
 * twelve-minute documentary is minutes of CPU — so a timeline that was never
 * going to produce a usable video should fail in milliseconds rather than after
 * the encode. Every check here is arithmetic on data that already exists.
 *
 * The important one is coverage. A timeline whose pictures end two minutes
 * before the narration produces a video that plays two minutes of black over a
 * voice still talking, and that renders perfectly happily: ffmpeg has no
 * opinion about it, the file is valid, and the only thing that notices is a
 * viewer.
 */

export type TimelineProblemKind =
  | 'no_items'
  | 'no_narration'
  | 'gap'
  | 'overlap'
  | 'short_scene'
  | 'coverage_short'
  | 'coverage_long'
  | 'missing_asset';

export interface TimelineProblem {
  kind: TimelineProblemKind;
  severity: 'blocking' | 'warning';
  message: string;
}

/** Rounding slop that is genuinely invisible. */
const TOLERANCE_SECONDS = 0.25;
/**
 * How far picture and audio may disagree before it stops being rounding.
 *
 * Two seconds either way on a twelve-minute video is imperceptible; ten is a
 * black tail or a cut-off ending.
 */
const COVERAGE_TOLERANCE = 2;
/** Below this a scene is a flash rather than a shot. */
const MIN_SCENE_SECONDS = 1.2;

export interface TimelineCheck {
  problems: TimelineProblem[];
  blocking: TimelineProblem[];
  /** Where the pictures actually end. */
  coverage: number;
  narrationDuration: number | null;
}

export function validateTimeline(
  items: TimelineItem[],
  narrationDuration: number | null,
): TimelineCheck {
  const problems: TimelineProblem[] = [];

  if (items.length === 0) {
    problems.push({
      kind: 'no_items',
      severity: 'blocking',
      message: 'The timeline has no scenes, so there is nothing to render.',
    });
    return { problems, blocking: problems, coverage: 0, narrationDuration };
  }

  const ordered = [...items].sort((a, b) => a.start - b.start);
  const coverage = ordered[ordered.length - 1]!.end;

  for (const [index, item] of ordered.entries()) {
    const length = item.end - item.start;
    if (length < MIN_SCENE_SECONDS) {
      problems.push({
        kind: 'short_scene',
        severity: 'warning',
        message: `Scene ${index + 1} is ${length.toFixed(1)}s — short enough to read as a flash rather than a shot.`,
      });
    }
    if (!item.video_asset_id) {
      problems.push({
        kind: 'missing_asset',
        severity: 'blocking',
        message: `Scene ${index + 1} has no visual asset. Rendering it would produce black.`,
      });
    }

    const next = ordered[index + 1];
    if (!next) continue;
    const gap = next.start - item.end;
    if (gap > TOLERANCE_SECONDS) {
      problems.push({
        kind: 'gap',
        severity: 'blocking',
        message: `A ${gap.toFixed(1)}s gap sits between scenes ${index + 1} and ${index + 2}. That renders as black with the narration still running.`,
      });
    } else if (gap < -TOLERANCE_SECONDS) {
      problems.push({
        kind: 'overlap',
        severity: 'warning',
        message: `Scenes ${index + 1} and ${index + 2} overlap by ${Math.abs(gap).toFixed(1)}s.`,
      });
    }
  }

  if (narrationDuration !== null && narrationDuration > 0) {
    const drift = coverage - narrationDuration;
    if (drift < -COVERAGE_TOLERANCE) {
      problems.push({
        kind: 'coverage_short',
        severity: 'blocking',
        message: `The pictures end ${Math.abs(drift).toFixed(1)}s before the narration does. The video would finish on black while the voice is still speaking.`,
      });
    } else if (drift > COVERAGE_TOLERANCE) {
      problems.push({
        kind: 'coverage_long',
        severity: 'warning',
        message: `The pictures run ${drift.toFixed(1)}s past the narration, so the video ends in silence.`,
      });
    }
  }

  return {
    problems,
    blocking: problems.filter((problem) => problem.severity === 'blocking'),
    coverage,
    narrationDuration,
  };
}

/**
 * Stretches or squeezes a timeline so the pictures cover the narration exactly.
 *
 * Proportional rather than absolute: every scene keeps its share of the
 * running time, so a shot the visual director wanted to hold stays longer than
 * one it wanted to pass through. Scaling the last scene alone would be simpler
 * and would leave a documentary ending on one shot held for a minute.
 */
export function fitTimelineToNarration(
  items: TimelineItem[],
  narrationDuration: number,
): TimelineItem[] {
  if (items.length === 0 || narrationDuration <= 0) return items;
  const coverage = items[items.length - 1]!.end;
  if (coverage <= 0) return items;

  const scale = narrationDuration / coverage;
  if (Math.abs(scale - 1) < 0.005) return items;

  let cursor = 0;
  return items.map((item) => {
    const length = Math.max(MIN_SCENE_SECONDS, (item.end - item.start) * scale);
    const next = {
      ...item,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + length).toFixed(3)),
    };
    cursor += length;
    return next;
  });
}
