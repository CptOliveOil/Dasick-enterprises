import { escapeAssText, toAssColour } from './ffmpeg';
import { arabicAssStyles } from '@/lib/islamic/arabic';

export interface CaptionCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Splits narration into caption-sized cues spread across a known duration.
 *
 * Without word-level timings from a speech provider, cues are proportional to
 * their share of the words — which is honest: it is derived from the narration
 * and the measured audio length, not invented.
 */
export function buildCues(
  segments: { text: string; start: number; duration: number }[],
  maxCharsPerCue = 84,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let index = 1;

  for (const segment of segments) {
    const chunks = splitForCaptions(segment.text, maxCharsPerCue);
    const totalWords = chunks.reduce((sum, c) => sum + wordCount(c), 0) || 1;
    let cursor = segment.start;

    for (const chunk of chunks) {
      const share = wordCount(chunk) / totalWords;
      const length = Math.max(0.8, segment.duration * share);
      cues.push({
        index: index++,
        start: Number(cursor.toFixed(3)),
        end: Number((cursor + length).toFixed(3)),
        text: chunk,
      });
      cursor += length;
    }
  }
  return cues;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Breaks on sentence boundaries first, then on length. */
function splitForCaptions(text: string, maxChars: number): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    let current = '';
    for (const word of sentence.split(' ')) {
      if ((current + ' ' + word).trim().length > maxChars) {
        if (current) chunks.push(current.trim());
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    }
    if (current) chunks.push(current.trim());
  }
  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}

function timestamp(seconds: number, separator: ',' | '.'): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function toSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map(
        (cue) =>
          `${cue.index}\n${timestamp(cue.start, ',')} --> ${timestamp(cue.end, ',')}\n${cue.text}`,
      )
      .join('\n\n') + '\n'
  );
}

export function toVtt(cues: CaptionCue[]): string {
  return (
    'WEBVTT\n\n' +
    cues
      .map(
        (cue) =>
          `${cue.index}\n${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.text}`,
      )
      .join('\n\n') +
    '\n'
  );
}

const ASS_STYLE_NAMES: Record<AssOverlay['style'], string> = {
  caption: 'Caption',
  title: 'Title',
  arabic: 'Arabic',
  arabicTranslation: 'ArabicTranslation',
};

function assTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m, 2)}:${s.toFixed(2).padStart(5, '0')}`;
}

export interface AssOverlay {
  start: number;
  end: number;
  text: string;
  /**
   * `arabic` and `arabicTranslation` exist so verified scripture reaches the
   * screen as text through libass, using a font that can shape it — never as
   * pixels from an image model, which renders Arabic as convincing nonsense.
   */
  style: 'caption' | 'title' | 'arabic' | 'arabicTranslation';
}

/**
 * Builds the single ASS file that carries both burned-in captions and
 * on-screen text for a render.
 */
export function buildAss(
  overlays: AssOverlay[],
  options: { width: number; height: number; accent?: string },
): string {
  const { width, height, accent = '#ffffff' } = options;
  const events = overlays
    .map(
      (overlay) =>
        `Dialogue: 0,${assTimestamp(overlay.start)},${assTimestamp(overlay.end)},${
          ASS_STYLE_NAMES[overlay.style]
        },,0,0,0,,${escapeAssText(overlay.text)}`,
    )
    .join('\n');

  const titleSize = Math.round(height * 0.062);
  const captionSize = Math.round(height * 0.038);

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Title sits upper-centre; captions sit lower-centre with a heavier outline
    // so they stay legible over any footage.
    `Style: Title,DejaVu Sans,${titleSize},${toAssColour(accent)},&H00101010,&H80000000,1,0,3,2,8,80,80,${Math.round(height * 0.08)},1`,
    `Style: Caption,DejaVu Sans,${captionSize},&H00FFFFFF,&H00101010,&HA0000000,0,0,3,1,2,120,120,${Math.round(height * 0.07)},1`,
    // Arabic needs a font with Arabic coverage — DejaVu Sans has none, and text
    // set in it renders as boxes.
    ...arabicAssStyles(width, height),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    events,
    '',
  ].join('\n');
}
