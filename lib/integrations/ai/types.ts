import type { z } from 'zod';
import type { AIProviderId } from '@/types/domain';

/**
 * A schema whose *output* is T. Zod's input type differs from its output
 * wherever `.default()` is used, so the input side is left open.
 */
export type StructuredSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export interface GenerateOptions {
  system: string;
  prompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  /** Estimated cost in USD, converted to the display currency at render time. */
  estimated_cost: number;
}

export interface TextResult {
  text: string;
  usage: Usage;
}

export interface StructuredResult<T> {
  data: T;
  raw: string;
  usage: Usage;
  /** True when the first response failed validation and a repair pass ran. */
  repaired: boolean;
}

/**
 * Provider contract. Nothing outside `lib/integrations/ai` should know which
 * company is behind a model — agents name a provider id and a model string.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  readonly configured: boolean;
  generateText(options: GenerateOptions): Promise<TextResult>;
  generateStructured<T>(
    options: GenerateOptions & { schema: StructuredSchema<T>; schemaName: string },
  ): Promise<StructuredResult<T>>;
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}
