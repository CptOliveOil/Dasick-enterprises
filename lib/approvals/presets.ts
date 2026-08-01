import type { ChangePreset } from './dossier/types';
import type { ApprovalKind } from '@/types/domain';

/**
 * The notes an operator gives most often, as one click each.
 *
 * "Request changes" used to open an empty textbox, which quietly asks the
 * operator to be a script editor with a blank page in front of them. Most of
 * the time the note they want to give is one of a dozen — the opening is flat,
 * it runs long, it needs more citations — and typing it out from scratch each
 * time is friction that ends in either a vague instruction or an approval
 * nobody meant to give.
 *
 * Presets are *instructions to an agent*, so they are written as instructions:
 * specific, bounded, and safe to combine. Several selected presets plus a
 * custom sentence become one brief, and the agent gets all of it.
 *
 * They are declared per approval kind, so a new business inherits sensible ones
 * from `DEFAULT_PRESETS` and can add its own without touching any UI.
 */

const SCRIPT_PRESETS: ChangePreset[] = [
  {
    id: 'rewrite-opening',
    group: 'Opening',
    label: 'Rewrite the opening',
    instruction:
      'Rewrite the opening section completely. Keep the same subject, but find a different way in — a different image, question or moment. Do not reuse the existing first sentence.',
  },
  {
    id: 'stronger-hook',
    group: 'Opening',
    label: 'Stronger hook',
    instruction:
      'Sharpen the cold open. Raise a specific question in the first two sentences and do not answer it until later in the script. No channel branding, no "in this video".',
  },
  {
    id: 'more-dramatic',
    group: 'Tone',
    label: 'More dramatic',
    instruction:
      'Raise the dramatic register throughout: shorter sentences at the turns, more concrete imagery, more weight on the stakes. Do not add facts that the research does not support.',
  },
  {
    id: 'increase-suspense',
    group: 'Tone',
    label: 'Increase suspense',
    instruction:
      'Restructure so information is withheld and released deliberately. Move at least one revelation later, and plant it earlier without giving it away.',
  },
  {
    id: 'add-humour',
    group: 'Tone',
    label: 'Add humour',
    instruction:
      'Add light humour where it fits — dry asides, understatement. Keep it out of the serious beats and never at the expense of accuracy.',
  },
  {
    id: 'simplify-language',
    group: 'Tone',
    label: 'Simplify the language',
    instruction:
      'Simplify the language. Shorter sentences, everyday words, no jargon unless it is explained the first time it appears. Keep every fact.',
  },
  {
    id: 'younger-audience',
    group: 'Audience',
    label: 'Target a younger audience',
    instruction:
      'Rewrite for a younger audience: faster opening, plainer vocabulary, shorter paragraphs, and concrete examples in place of abstractions. Do not talk down to them.',
  },
  {
    id: 'reduce-runtime',
    group: 'Length',
    label: 'Reduce the runtime',
    instruction:
      'Cut the runtime by roughly a quarter. Remove repetition and the weakest supporting material first. Keep the hook, the payoff and every verified claim.',
  },
  {
    id: 'increase-runtime',
    group: 'Length',
    label: 'Increase the runtime',
    instruction:
      'Extend the script by roughly a quarter using material already in the research package — more detail, more context, another example. Do not pad and do not invent.',
  },
  {
    id: 'reduce-repetition',
    group: 'Length',
    label: 'Reduce repetition',
    instruction:
      'Find where the script says the same thing twice and say it once, in the stronger place.',
  },
  {
    id: 'more-citations',
    group: 'Accuracy',
    label: 'More citations',
    instruction:
      'Attribute the claims in the narration itself — name the source in the line where the claim appears. Where a claim has no source in the research package, either soften it to reflect the uncertainty or remove it.',
  },
  {
    id: 'address-warnings',
    group: 'Accuracy',
    label: 'Address every fact-check warning',
    instruction:
      'Work through every claim the fact check flagged. Correct what is wrong, source what is unsourced, and phrase what is uncertain as uncertain.',
  },
  {
    id: 'improve-pacing',
    group: 'Structure',
    label: 'Improve the pacing',
    instruction:
      'Even out the pacing. Break up any section that runs long, and add an attention reset roughly every four minutes.',
  },
  {
    id: 'rewrite-ending',
    group: 'Structure',
    label: 'Rewrite the ending',
    instruction:
      'Rewrite the ending so it closes the exact question the opening raised. No summary of what was just said.',
  },
  {
    id: 'stronger-cta',
    group: 'Structure',
    label: 'Stronger call to action',
    instruction:
      'Write a call to action that follows from the content rather than sitting on top of it — one specific ask, in the voice of the piece.',
  },
];

const RESEARCH_PRESETS: ChangePreset[] = [
  {
    id: 'go-deeper',
    group: 'Depth',
    label: 'Go deeper',
    instruction: 'Go further on the strongest two or three threads rather than covering more ground.',
  },
  {
    id: 'more-sources',
    group: 'Accuracy',
    label: 'Source more claims',
    instruction:
      'Attach a source to every claim that has none. Where you cannot find one, mark the claim uncertain rather than dropping the source silently.',
  },
  {
    id: 'different-angle',
    group: 'Direction',
    label: 'Find a different angle',
    instruction: 'Approach the subject from a different angle. Say explicitly what the new angle is and why it is better.',
  },
  {
    id: 'less-known',
    group: 'Direction',
    label: 'Focus on the lesser-known',
    instruction: 'Cut what a casual audience already knows and expand what they do not.',
  },
];

const IDEA_PRESETS: ChangePreset[] = [
  {
    id: 'more-specific',
    group: 'Direction',
    label: 'Be more specific',
    instruction: 'These are too broad. Narrow each one to a single answerable question.',
  },
  {
    id: 'more-original',
    group: 'Direction',
    label: 'More original',
    instruction: 'Replace anything that has obviously been covered many times with something less worn.',
  },
  {
    id: 'evergreen-only',
    group: 'Direction',
    label: 'Evergreen only',
    instruction: 'Drop anything trend-driven. Every idea should still make sense in two years.',
  },
];

const VISUAL_PRESETS: ChangePreset[] = [
  {
    id: 'bolder',
    group: 'Design',
    label: 'Bolder',
    instruction: 'Push the contrast and the focal point much harder. It has to read at thumbnail size.',
  },
  {
    id: 'less-text',
    group: 'Design',
    label: 'Less text',
    instruction: 'Cut the on-image text to three words at most.',
  },
  {
    id: 'different-direction',
    group: 'Design',
    label: 'Different direction',
    instruction: 'These are variations on one idea. Give me genuinely different directions.',
  },
];

const COMMERCE_PRESETS: ChangePreset[] = [
  {
    id: 'clearer-value',
    group: 'Copy',
    label: 'Clearer value',
    instruction: 'Say what the buyer gets in the first line, in their words rather than ours.',
  },
  {
    id: 'ip-safe',
    group: 'Risk',
    label: 'Remove intellectual-property risk',
    instruction:
      'Remove anything that leans on a brand, character or logo we do not own. Describe the demand without borrowing the property.',
  },
  {
    id: 'reprice',
    group: 'Commercial',
    label: 'Reconsider the price',
    instruction: 'Reconsider the price and justify it against what comparable listings actually charge.',
  },
];

/** Applies to any kind, including ones that do not exist yet. */
const DEFAULT_PRESETS: ChangePreset[] = [
  {
    id: 'more-detail',
    group: 'Depth',
    label: 'More detail',
    instruction: 'There is not enough here to judge. Go further and show the reasoning.',
  },
  {
    id: 'be-specific',
    group: 'Depth',
    label: 'Be more specific',
    instruction: 'Replace the general statements with specifics — names, figures, examples.',
  },
  {
    id: 'try-again',
    group: 'Direction',
    label: 'Try a different approach',
    instruction: 'This approach is not working. Take a different one and say what changed.',
  },
];

const BY_KIND: Partial<Record<ApprovalKind, ChangePreset[]>> = {
  script: SCRIPT_PRESETS,
  research: RESEARCH_PRESETS,
  idea: IDEA_PRESETS,
  thumbnail: VISUAL_PRESETS,
  video: VISUAL_PRESETS,
  listing: COMMERCE_PRESETS,
  product: COMMERCE_PRESETS,
};

/**
 * Presets for a kind. Unknown kinds get the defaults rather than nothing — a
 * business nobody has written presets for still gets a better box than a blank
 * one.
 */
export function presetsFor(kind: ApprovalKind): ChangePreset[] {
  return BY_KIND[kind] ?? DEFAULT_PRESETS;
}

/**
 * Turns the operator's selections into one brief.
 *
 * Numbered, because an agent handed five instructions in a paragraph reliably
 * addresses the first and the last. The custom note goes last and is introduced
 * as the operator's own words, so it carries more weight than the presets it
 * follows.
 */
export function composeChangeRequest(instructions: string[], custom?: string): string {
  const clean = instructions.map((line) => line.trim()).filter(Boolean);
  const note = custom?.trim();

  if (clean.length === 0) return note ?? '';
  if (clean.length === 1 && !note) return clean[0]!;

  const numbered = clean.map((line, index) => `${index + 1}. ${line}`).join('\n');
  return note
    ? `${numbered}\n\nIn the operator's own words: ${note}`
    : numbered;
}
