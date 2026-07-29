import type { RunContext } from '@/lib/agents/context';
import {
  renderBusiness,
  renderMemory,
  renderPreviousOutputs,
} from '@/lib/agents/context';
import { SOURCE_CATEGORIES, SOURCE_CATEGORY_DESCRIPTIONS } from '@/types/islamic';

/**
 * The instruction that matters most, stated once and reused by every Islamic
 * handler so it cannot drift between them.
 *
 * It is phrased as a description of what a correct answer looks like rather
 * than a list of prohibitions, because "leave it null" is an action a model can
 * take, whereas "do not hallucinate" is not.
 */
export const NO_FABRICATION = [
  'Absolute rule, above everything else in this prompt:',
  '',
  'You do not invent. Not a verse, not a hadith, not a wording, not a grading, not a',
  'narrator, not a chain, not a scholarly position, not a reference, and not a single word',
  'of Arabic. If you do not reliably know something, the correct answer is null, or the',
  'string "unknown" where the field is an enum.',
  '',
  'A null is useful — it tells a human exactly what to go and check. A plausible-looking',
  'citation that turns out to be wrong is repeated by an audience as religion, and cannot',
  'be taken back. Given the choice between an incomplete package and a confident one, give',
  'the incomplete one.',
  '',
  'Familiarity is not evidence. Many widely-circulated quotations are misattributed, and',
  "the ones that 'sound like a hadith' are the most likely to be fabricated. If you cannot",
  'place a text in a specific collection, say so rather than guessing at one.',
].join('\n');

/** The source classification the whole feature is built around. */
export const SOURCE_CATEGORY_GUIDE = [
  'Classify every religious claim into exactly one of these categories:',
  ...SOURCE_CATEGORIES.map(
    (category) => `- ${category}: ${SOURCE_CATEGORY_DESCRIPTIONS[category]}`,
  ),
  '',
  'UNVERIFIED is a real answer and is preferable to a wrong one. Use it whenever nothing',
  'reliable stands behind a claim.',
].join('\n');

/**
 * Shared prompt preamble.
 *
 * Deliberately assembled from the same `renderBusiness` / `renderMemory` /
 * `renderPreviousOutputs` helpers the rest of the system uses, so an Islamic
 * agent receives its context by exactly the same route as every other agent.
 */
export async function baseIslamicContext(ctx: RunContext): Promise<string> {
  return [
    renderBusiness(ctx.business),
    '',
    renderMemory(ctx.memory),
    '',
    ctx.mission ? `Mission: ${ctx.mission.title}\nObjective: ${ctx.mission.objective}` : '',
    '',
    renderPreviousOutputs(ctx.previousOutputs),
    '',
    `Task: ${ctx.task.title}`,
    ctx.task.description ? `Detail: ${ctx.task.description}` : '',
    Object.keys(ctx.task.input).length > 0
      ? `Task input:\n${JSON.stringify(ctx.task.input, null, 2)}`
      : '',
    '',
    SOURCE_CATEGORY_GUIDE,
    feedbackNote(ctx),
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');
}

function feedbackNote(ctx: RunContext): string {
  const feedback = ctx.task.input.operator_feedback;
  if (typeof feedback !== 'string' || feedback.trim().length === 0) return '';
  return `\nThe operator reviewed a previous attempt and asked for changes:\n"${feedback}"\nAddress this directly.`;
}
