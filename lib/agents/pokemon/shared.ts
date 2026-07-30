import type { RunContext } from '@/lib/agents/context';
import {
  renderBusiness,
  renderMemory,
  renderPreviousOutputs,
} from '@/lib/agents/context';
import { providerIsLive } from '@/lib/integrations/ai';
import { POKEMON_CATEGORIES } from '@/types/pokemon';

/**
 * Shared prompt material for the Pokémon Researcher.
 *
 * Assembled from the same `renderBusiness` / `renderMemory` /
 * `renderPreviousOutputs` helpers every other agent uses, so this specialist
 * receives its context by exactly the same route as the rest of the workforce.
 */

/**
 * The rule that separates what this agent knows from what it would be guessing.
 *
 * Card history is knowledge: which set something came from, why a print run was
 * strange, what collectors made of it at the time. Card prices are a moving
 * number nothing here is connected to. Stated as a description of the correct
 * answer rather than a prohibition, because "say it needs a live source" is an
 * action a model can take and "do not hallucinate" is not.
 */
export const NO_INVENTED_MARKET_DATA = [
  'Absolute rule, above everything else in this prompt:',
  '',
  'You do not state prices, valuations, grading populations, auction results, or what is',
  'trending right now. Nothing in this system is connected to a live market source, so any',
  'number you produce would be invented, and an invented price is the kind of thing an',
  'operator acts on before discovering it was never real.',
  '',
  'What you can do instead is far more useful: explain why a card, set or print run is',
  'interesting, what happened at the time, what made it unusual, and what collectors said',
  'about it. That is history, and it does not go out of date.',
  '',
  'Where a topic genuinely depends on current market data, say so plainly in',
  '`research_required` and set the topic up so a human can fill that part in. A topic that',
  'names what it needs is worth more than one that pretends not to need it.',
].join('\n');

/**
 * The distinction the Etsy work turns on.
 *
 * Researching demand for a franchise is ordinary research. Selling its artwork
 * is a different question with a different answer, and the agent is told to
 * keep the two apart rather than to avoid the subject.
 */
export const IP_SEPARATION = [
  'Two different questions, and you must not let them merge:',
  '',
  '(a) Is there demand? — What people are searching for and buying is a fact about the',
  '    world. Report it plainly, including where the demand is for protected material.',
  '',
  '(b) May we sell it? — Almost always no, where a product would reproduce artwork,',
  '    characters, card faces, logos or branding belonging to Nintendo, Game Freak,',
  '    Creatures Inc. or The Pokémon Company. We hold no licence for any of it.',
  '',
  'So: report the demand honestly, then describe the product concept precisely enough that',
  'a person can judge it. Use `depicts` to say exactly what would appear on the product —',
  'that field is read as the description of what we would be reproducing, so vagueness',
  'there is worse than an uncomfortable answer.',
  '',
  'Where the demand is real but the obvious product is not ours to sell, propose an',
  'original direction of our own that serves the same buyer. Never present a derivative,',
  'a trace, a redraw or a "fan art" version as though it resolved the problem. It does not.',
].join('\n');

export const CATEGORY_GUIDE = [
  'Use exactly one of these categories per opportunity:',
  POKEMON_CATEGORIES.join(', '),
].join('\n');

export const LIFESPAN_GUIDE = [
  '`lifespan` is a real decision, not a formality:',
  '- "evergreen": worth making at any point, and still worth watching in three years.',
  '- "trend_driven": worth making now because of something currently happening, and worth',
  '  little afterwards.',
  'Choose honestly. Marking everything evergreen makes the field useless.',
].join('\n');

export async function basePokemonContext(ctx: RunContext): Promise<string> {
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
    CATEGORY_GUIDE,
    '',
    LIFESPAN_GUIDE,
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

/**
 * True when this run came from the simulated provider rather than a real model.
 *
 * Recorded on every row so simulated research is labelled as simulated in the
 * data, not only in the `[Simulated]` prefix the mock provider writes into the
 * text. A row that is later exported, counted or quoted keeps the label.
 */
export function isSimulated(ctx: RunContext): boolean {
  return !providerIsLive(ctx.agent.provider);
}

/** Appended to an activity summary so Demo Mode never reads as real work. */
export function simulatedSuffix(ctx: RunContext): string {
  return isSimulated(ctx) ? ' (simulated — no AI provider connected)' : '';
}

/** Everything the policy checks should read, joined into one body of text. */
export function opportunityText(parts: (string | string[] | null | undefined)[]): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
}

export const NUMBER_HONESTY = [
  'Never invent a view count, a subscriber number, a search volume or a sales figure. If',
  'you do not know a number, describe what you do know and leave the number out. Leave',
  '`sources` empty rather than citing something you are not sure exists.',
].join('\n');
