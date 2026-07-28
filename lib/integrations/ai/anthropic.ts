import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { config } from '@/lib/config';
import { describeSchema, parseStructured } from './json';
import {
  StructuredOutputError,
  type AIProvider,
  type GenerateOptions,
  type StructuredResult,
  type StructuredSchema,
  type TextResult,
  type Usage,
} from './types';

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

  async generateText(options: GenerateOptions): Promise<TextResult> {
    const client = this.require();
    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: [{ role: 'user', content: options.prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return { text, usage: toUsage(options.model, response.usage) };
  }

  async generateStructured<T>(
    options: GenerateOptions & { schema: StructuredSchema<T>; schemaName: string },
  ): Promise<StructuredResult<T>> {
    const instructions = describeSchema(options.schema as z.ZodTypeAny, options.schemaName);
    const first = await this.generateText({
      ...options,
      system: `${options.system}\n\n${instructions}`,
    });

    const parsed = parseStructured(first.text, options.schema);
    if (parsed.ok) {
      return { data: parsed.data!, raw: first.text, usage: first.usage, repaired: false };
    }

    // One repair attempt: hand the model its own output and the validation error.
    const repair = await this.generateText({
      ...options,
      temperature: 0,
      system: `${options.system}\n\n${instructions}`,
      prompt: [
        'Your previous response could not be used.',
        `Problem: ${parsed.error}`,
        '',
        'Previous response:',
        first.text.slice(0, 6000),
        '',
        'Return corrected JSON only.',
      ].join('\n'),
    });

    const repaired = parseStructured(repair.text, options.schema);
    const usage: Usage = {
      input_tokens: first.usage.input_tokens + repair.usage.input_tokens,
      output_tokens: first.usage.output_tokens + repair.usage.output_tokens,
      estimated_cost: first.usage.estimated_cost + repair.usage.estimated_cost,
    };

    if (!repaired.ok) {
      throw new StructuredOutputError(
        `Structured output failed validation after one repair attempt. ${repaired.error}`,
        repair.text,
      );
    }
    return { data: repaired.data!, raw: repair.text, usage, repaired: true };
  }
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
