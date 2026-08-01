import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { config } from '@/lib/config';
import { describeSchema, parseStructured, rootIsObject } from './json';
import {
  StructuredOutputError,
  type AIProvider,
  type GenerateOptions,
  type StructuredDiagnostics,
  type StructuredResult,
  type StructuredSchema,
  type TextResult,
  type Usage,
} from './types';

/**
 * Floor on output tokens for a structured reply.
 *
 * An agent's `max_tokens` is tuned for prose. A research package for a
 * documentary is eleven arrays of objects, and at the seeded 4,096 it can run
 * out of room mid-object — which surfaced as "No JSON object found", because a
 * brace that never closes is indistinguishable from no JSON at all.
 *
 * This raises the ceiling only for structured calls, and only upward: an agent
 * configured higher keeps its own figure. It costs nothing when unused, since
 * output tokens are billed as generated rather than as reserved.
 */
const MIN_STRUCTURED_TOKENS = 8192;

/** Hard ceiling, so a repair cannot escalate without limit. */
const MAX_STRUCTURED_TOKENS = 16384;

/**
 * Diagnostics, deliberately without prompts.
 *
 * What is needed to diagnose a bad reply is its shape — how it stopped, how
 * long it was, which block types it carried — not its content. Prompts can hold
 * operator data and are never logged; nor is the key, which never leaves
 * `lib/config.ts`.
 */
function logAttempt(diagnostics: StructuredDiagnostics): void {
  const line = [
    `[structured] ${diagnostics.provider}/${diagnostics.model}`,
    `attempt=${diagnostics.attempt}`,
    `stop=${diagnostics.stopReason ?? 'unknown'}`,
    `chars=${diagnostics.responseLength}`,
    `blocks=${diagnostics.blockTypes.join(',') || 'none'}`,
    `max_tokens=${diagnostics.maxTokens}`,
    diagnostics.failure ? `failure=${diagnostics.failure}` : 'failure=none',
  ].join(' ');
  if (diagnostics.failure) console.warn(line);
  else console.info(line);
}

/** USD per million tokens. Used for cost estimates only. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function priceFor(model: string) {
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return PRICING[key ?? 'claude-sonnet-4-5']!;
}

function estimateCost(model: string, input: number, output: number): number {
  const price = priceFor(model);
  return Number(
    ((input / 1_000_000) * price.input + (output / 1_000_000) * price.output).toFixed(6),
  );
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;
  readonly configured: boolean;
  private client: Anthropic | null;

  constructor(apiKey = config.anthropic.apiKey) {
    this.configured = Boolean(apiKey);
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  private require(): Anthropic {
    if (!this.client) {
      throw new Error(
        'Anthropic is not configured. Set ANTHROPIC_API_KEY to run agents on Claude.',
      );
    }
    return this.client;
  }

  async generateText(
    options: GenerateOptions & { prefill?: string },
  ): Promise<TextResult> {
    const client = this.require();
    const maxTokens = options.maxTokens ?? 4096;

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: options.prompt },
    ];
    // Putting an opening brace in the assistant's mouth removes the single most
    // common failure outright: the model cannot open with "Here is the research
    // you asked for" when its reply has already begun with `{`.
    if (options.prefill) messages.push({ role: 'assistant', content: options.prefill });

    const response = await client.messages.create({
      model: options.model,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages,
    });

    const body = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return {
      // The prefill is part of the reply the model wrote, so it belongs in the
      // text the parser sees.
      text: options.prefill ? `${options.prefill}${body}` : body,
      usage: toUsage(options.model, response.usage),
      stopReason: response.stop_reason ?? null,
      blockTypes: response.content.map((block) => block.type),
    };
  }

  async generateStructured<T>(
    options: GenerateOptions & { schema: StructuredSchema<T>; schemaName: string },
  ): Promise<StructuredResult<T>> {
    const schema = options.schema as z.ZodTypeAny;
    const instructions = describeSchema(schema, options.schemaName);
    // Only when the schema's root really is an object, otherwise the prefill
    // would be a lie about the shape being asked for.
    const prefill = rootIsObject(schema) ? '{' : undefined;
    const maxTokens = Math.min(
      MAX_STRUCTURED_TOKENS,
      Math.max(options.maxTokens ?? 4096, MIN_STRUCTURED_TOKENS),
    );

    const first = await this.generateText({
      ...options,
      maxTokens,
      system: `${options.system}\n\n${instructions}`,
      prefill,
    });

    const parsed = parseStructured(first.text, options.schema);
    logAttempt({
      provider: 'anthropic',
      model: options.model,
      attempt: 'first',
      stopReason: first.stopReason ?? null,
      responseLength: first.text.length,
      blockTypes: first.blockTypes ?? [],
      maxTokens,
      failure: parsed.failure,
    });

    if (parsed.ok) {
      return { data: parsed.data!, raw: first.text, usage: first.usage, repaired: false };
    }

    // Believe the provider over the shape of the text. `stop_reason` is the
    // authoritative answer to "were you cut off", and it matters here because
    // the `{` prefill makes *any* non-JSON continuation look truncated — the
    // brace is always open. Inference is only used when no stop reason came
    // back at all.
    const truncated =
      first.stopReason === 'max_tokens' ||
      (first.stopReason == null && parsed.failure === 'truncated');

    // One repair attempt, and only one. A second would double the bill for a
    // model that has already demonstrated it cannot produce this.
    const repairTokens = truncated
      ? Math.min(MAX_STRUCTURED_TOKENS, maxTokens * 2)
      : maxTokens;

    const repair = await this.generateText({
      ...options,
      temperature: 0,
      maxTokens: repairTokens,
      system: `${options.system}\n\n${instructions}`,
      prompt: repairPrompt({
        original: options.prompt,
        previous: first.text,
        problem: parsed.error ?? 'The response could not be parsed.',
        truncated,
        schemaName: options.schemaName,
      }),
      prefill,
    });

    const repaired = parseStructured(repair.text, options.schema);
    logAttempt({
      provider: 'anthropic',
      model: options.model,
      attempt: 'repair',
      stopReason: repair.stopReason ?? null,
      responseLength: repair.text.length,
      blockTypes: repair.blockTypes ?? [],
      maxTokens: repairTokens,
      failure: repaired.failure,
    });

    const usage: Usage = {
      input_tokens: first.usage.input_tokens + repair.usage.input_tokens,
      output_tokens: first.usage.output_tokens + repair.usage.output_tokens,
      estimated_cost: first.usage.estimated_cost + repair.usage.estimated_cost,
    };

    if (!repaired.ok) {
      throw new StructuredOutputError(
        `Structured output failed validation after one repair attempt. ${repaired.error}` +
          (repair.stopReason === 'max_tokens'
            ? ` The response was still cut off at ${repairTokens} output tokens — the requested package may simply be too large for one reply.`
            : ''),
        repair.text,
      );
    }
    return { data: repaired.data!, raw: repair.text, usage, repaired: true };
  }

}

/**
 * The repair request.
 *
 * The previous version handed back up to six thousand characters of the failed
 * reply and said "Return corrected JSON only" — which is close to useless when
 * the reply was cut off, because the model has no idea it was cut off, is given
 * no more room, and dutifully produces the same over-long answer again.
 *
 * This one states which of the failures happened, restates the task so the
 * model is not working from the broken output alone, and — where the problem
 * was length — asks explicitly for a shorter answer to go with the larger
 * budget it has been given.
 */
function repairPrompt(input: {
  original: string;
  previous: string;
  problem: string;
  truncated: boolean;
  schemaName: string;
}): string {
  const excerpt = input.previous.trim();
  return [
    'Your previous response could not be used.',
    '',
    `What went wrong: ${input.problem}`,
    '',
    input.truncated
      ? [
          'You ran out of output tokens before closing the JSON, so the object was',
          'incomplete and had to be discarded. You have more room this time, but the',
          'safer fix is a shorter answer: keep every required field, and cut the number',
          'of entries in each array and the length of each string until the whole object',
          'comfortably fits. A short complete object is useful; a long incomplete one is',
          'worth nothing.',
        ].join('\n')
      : [
          'Reply with the JSON object and nothing else — no preamble, no explanation,',
          'no code fence, no closing remark. The first character of your reply must be',
          '`{` and the last must be `}`.',
        ].join('\n'),
    '',
    'The original task, unchanged:',
    input.original.slice(0, 4000),
    '',
    // A truncated reply is not worth re-reading in full; it is the same content
    // that did not fit. A malformed one is worth showing, because the model can
    // see what it did.
    input.truncated
      ? 'Do not continue the previous response. Start again from the beginning.'
      : `Your previous reply, which did not parse:\n${excerpt.slice(0, 3000)}`,
    '',
    `Return one complete JSON object matching the "${input.schemaName}" schema.`,
  ].join('\n');
}

function toUsage(model: string, usage: Anthropic.Usage): Usage {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return {
    input_tokens: input,
    output_tokens: output,
    estimated_cost: estimateCost(model, input, output),
  };
}
