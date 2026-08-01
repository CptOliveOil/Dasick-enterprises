import type { Scene, SceneVisual } from './dossier/types';
import type { ScriptSection } from '@/types/domain';

/**
 * The storyboard a script implies, before anything is shot or rendered.
 *
 * This is a *reading aid*, not a production plan. It splits narration into
 * scene-sized beats and, from the language in each beat, names the kind of
 * visual that beat is asking for — a date wants archive, a place wants a map, a
 * percentage wants a graphic. Nothing is fetched, nothing is generated and no
 * footage is claimed to exist. The panel says so, because a suggested visual
 * presented as a located one would be a fabrication.
 *
 * Its value at review time is negative space: a scene the tool cannot suggest
 * anything concrete for is usually a scene written too abstractly to film.
 */

/** Documentary narration sits around 155 words a minute. */
const WORDS_PER_MINUTE = 155;
/** Beats longer than this stop being a scene and become a monologue. */
const MAX_SCENE_SECONDS = 45;
const MIN_SCENE_WORDS = 25;

const SIGNALS: { kind: string; pattern: RegExp; suggestion: (match: string) => string }[] = [
  {
    kind: 'Archive footage',
    pattern: /\b(1[89]\d{2}|20[0-2]\d)\b/,
    suggestion: (match) => `Period material from ${match} — the year is named in the narration.`,
  },
  {
    kind: 'Map',
    pattern: /\b(?:in|from|across|to|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    suggestion: (match) => `Locate ${match.replace(/^(?:in|from|across|to|near|around)\s+/, '')} on a map or globe move.`,
  },
  {
    kind: 'Data graphic',
    pattern: /\b(\d+(?:\.\d+)?\s?(?:%|per cent|percent|million|billion|thousand))\b/i,
    suggestion: (match) => `Put ${match} on screen — the figure carries the beat.`,
  },
  {
    kind: 'Screenshot',
    pattern: /\b(?:announced|posted|wrote|tweeted|stated|published|according to)\b/i,
    suggestion: () => 'Show the source on screen — the statement is being quoted, not paraphrased.',
  },
  {
    kind: 'Animation',
    pattern: /\b(?:how it works|the process|step by step|mechanism|explains?|works by|because)\b/i,
    suggestion: () => 'A built explainer — this beat describes a process rather than an event.',
  },
  {
    kind: 'Comparison',
    pattern: /\b(?:compared|versus|vs\.?|unlike|whereas|but|however|instead)\b/i,
    suggestion: () => 'Side-by-side or split screen — the beat turns on a contrast.',
  },
];

/** The role a section plays, phrased for a storyboard column. */
const ROLE: Partial<Record<ScriptSection['kind'], string>> = {
  hook: 'Cold open',
  introduction: 'Set-up',
  main: 'Body',
  transition: 'Transition',
  pattern_interrupt: 'Reset',
  payoff: 'Payoff',
  ending: 'Close',
  cta: 'Call to action',
};

export function sceneLabel(kind: ScriptSection['kind']): string {
  return ROLE[kind] ?? 'Section';
}

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const secondsFor = (count: number) => Math.round((count / WORDS_PER_MINUTE) * 60);

export function buildScenes(sections: ScriptSection[]): Scene[] {
  const scenes: Scene[] = [];

  for (const [index, section] of sections.entries()) {
    for (const [part, narration] of splitBeats(section.body).entries()) {
      const count = wordsIn(narration);
      if (count === 0) continue;
      scenes.push({
        id: `${index}-${part}`,
        number: scenes.length + 1,
        heading:
          part === 0
            ? `${sceneLabel(section.kind)} — ${section.heading}`
            : `${section.heading} (continued)`,
        seconds: secondsFor(count),
        narration,
        visuals: suggestVisuals(narration),
      });
    }
  }

  return scenes;
}

/**
 * Splits a section at sentence boundaries into beats no longer than 45 seconds.
 *
 * Sentence boundaries rather than word counts, because a scene that cuts mid
 * sentence is not a scene — the storyboard has to match where a cut could
 * actually land.
 */
function splitBeats(body: string): string[] {
  const text = body.trim();
  if (text.length === 0) return [];

  const limit = Math.round((MAX_SCENE_SECONDS / 60) * WORDS_PER_MINUTE);
  if (wordsIn(text) <= limit) return [text];

  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const beats: string[] = [];
  let current = '';

  for (const part of parts) {
    const candidate = current + part;
    if (wordsIn(candidate) > limit && wordsIn(current) >= MIN_SCENE_WORDS) {
      beats.push(current.trim());
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) beats.push(current.trim());
  return beats;
}

export function suggestVisuals(narration: string): SceneVisual[] {
  const visuals: SceneVisual[] = [];

  for (const signal of SIGNALS) {
    const match = narration.match(signal.pattern);
    if (!match) continue;
    visuals.push({ kind: signal.kind, suggestion: signal.suggestion(match[0]) });
    if (visuals.length === 3) break;
  }

  if (visuals.length === 0) {
    // Deliberately not a suggestion. A beat with no concrete hook is a note to
    // the operator that the writing, not the footage, is the problem.
    visuals.push({
      kind: 'B-roll',
      suggestion:
        'Nothing specific to cut to — this beat names no date, place, figure or quote. General B-roll would be the fallback, which usually means the narration wants rewriting.',
    });
  }

  return visuals;
}
