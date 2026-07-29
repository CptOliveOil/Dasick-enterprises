import type { z } from 'zod';
import { parseStructured } from './json';
import {
  StructuredOutputError,
  type AIProvider,
  type GenerateOptions,
  type StructuredResult,
  type StructuredSchema,
  type TextResult,
} from './types';

/**
 * Deterministic stand-in used when no AI provider is configured.
 *
 * It synthesises schema-valid output from the Zod schema itself, so the whole
 * pipeline — validation, storage, workflow progression, approvals — genuinely
 * runs. Everything it produces is prefixed so it can never be mistaken for
 * real model output.
 */
export const SIMULATED_PREFIX = '[Simulated]';

export class MockProvider implements AIProvider {
  readonly id = 'mock' as const;
  readonly configured = true;

  async generateText(options: GenerateOptions): Promise<TextResult> {
    const text = `${SIMULATED_PREFIX} No AI provider is configured, so this is placeholder output for: ${options.prompt.slice(0, 200)}`;
    return {
      text,
      usage: { input_tokens: 0, output_tokens: 0, estimated_cost: 0 },
    };
  }

  async generateStructured<T>(
    options: GenerateOptions & { schema: StructuredSchema<T>; schemaName: string },
  ): Promise<StructuredResult<T>> {
    const synthesised = synthesise(options.schema as z.ZodTypeAny, {
      seed: hash(options.prompt + options.schemaName),
      path: [],
      index: 0,
    });
    const raw = JSON.stringify(synthesised, null, 2);
    const parsed = parseStructured(raw, options.schema);
    if (!parsed.ok) {
      throw new StructuredOutputError(
        `Mock provider could not synthesise valid output for ${options.schemaName}: ${parsed.error}`,
        raw,
      );
    }
    return {
      data: parsed.data!,
      raw,
      usage: { input_tokens: 0, output_tokens: 0, estimated_cost: 0 },
      repaired: false,
    };
  }
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

interface Ctx {
  seed: number;
  path: string[];
  /** Position within the enclosing array, so ordering fields stay sequential. */
  index: number;
}

const FILLER = [
  'This is simulated placeholder content produced without a live AI provider',
  'Connect an AI provider in Settings to replace it with real generated output',
  'The surrounding pipeline is genuine: validation, storage and approvals all ran',
];

function fillerText(minLength: number, label: string): string {
  let text = `${SIMULATED_PREFIX} ${label}.`;
  let i = 0;
  while (text.length < minLength) {
    text += ` ${FILLER[i % FILLER.length]}.`;
    i += 1;
  }
  return text;
}

function checkValue(
  def: { checks?: Array<{ kind: string; value?: number; inclusive?: boolean }> },
  kind: string,
) {
  return def.checks?.find((c) => c.kind === kind)?.value;
}

/** `.positive()` is an exclusive minimum of 0, so zero is not a legal value. */
function excludesZero(def: {
  checks?: Array<{ kind: string; value?: number; inclusive?: boolean }>;
}): boolean {
  const min = def.checks?.find((c) => c.kind === 'min');
  return Boolean(min && min.value === 0 && min.inclusive === false);
}

function synthesise(schema: z.ZodTypeAny, ctx: Ctx): unknown {
  const def = schema._def as {
    typeName?: string;
    innerType?: z.ZodTypeAny;
    type?: z.ZodTypeAny;
    values?: string[];
    checks?: Array<{ kind: string; value?: number }>;
    minLength?: { value: number } | null;
    maxLength?: { value: number } | null;
    defaultValue?: () => unknown;
    valueType?: z.ZodTypeAny;
  };

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        out[key] = synthesise(value, { ...ctx, path: [...ctx.path, key] });
      }
      return out;
    }
    case 'ZodArray': {
      const min = def.minLength?.value ?? 1;
      const max = def.maxLength?.value ?? min + 2;
      // Enough items that lists look like lists, without ignoring the bounds.
      const count = Math.min(max, Math.max(min, 3));
      return Array.from({ length: count }, (_, i) =>
        synthesise(def.type as z.ZodTypeAny, {
          seed: ctx.seed + i,
          path: [...ctx.path, String(i)],
          index: i,
        }),
      );
    }
    case 'ZodString': {
      const min = checkValue(def, 'min') ?? 0;
      const max = checkValue(def, 'max') ?? Number.MAX_SAFE_INTEGER;
      const label = ctx.path[ctx.path.length - 1] ?? 'value';
      const text = fillerText(min, humanise(label));
      return text.length > max ? text.slice(0, max) : text;
    }
    case 'ZodNumber': {
      const min = checkValue(def, 'min') ?? 0;
      const max = checkValue(def, 'max') ?? min + 100;
      const isInt = def.checks?.some((c) => c.kind === 'int');
      const field = (ctx.path[ctx.path.length - 1] ?? '').toLowerCase();

      // `confidence`-style 0–1 fields need a fraction, not an integer.
      if (!isInt && max <= 1) return Number((0.55 + (ctx.seed % 30) / 100).toFixed(2));

      // Ordering fields must be sequential and distinct, or the output is
      // internally inconsistent — duplicate scene numbers, chapters out of order.
      if (/(^|_)(number|index|order)$/.test(field)) {
        const base = min > 0 || excludesZero(def) ? 1 : 0;
        return base + ctx.index;
      }
      if (field.includes('start') && field.includes('second')) {
        return ctx.index * 10;
      }

      // Otherwise sit near the low end of the range: a placeholder should look
      // plausible, and an 8-second scene is more plausible than a 2-minute one.
      const spread = Math.max(0, max - min);
      const value = min + spread * 0.1 + (ctx.seed % 3);
      const bounded = Math.min(max, Math.max(min || (isInt ? 1 : 0.1), value));
      return isInt ? Math.max(1, Math.round(bounded)) : Number(bounded.toFixed(2));
    }
    case 'ZodBoolean':
      return ctx.seed % 2 === 0;
    case 'ZodEnum':
      // Always the first variant. Schemas here list the benign value first
      // ("verified", "pass", "info"), and a simulated fact check that randomly
      // declares claims incorrect would be manufacturing failures rather than
      // standing in for a real one.
      return def.values?.[0] ?? '';
    case 'ZodNullable':
      return null;
    case 'ZodOptional':
    case 'ZodDefault':
      return synthesise(def.innerType as z.ZodTypeAny, ctx);
    case 'ZodRecord':
      return {};
    case 'ZodUnknown':
    case 'ZodAny':
      return null;
    default:
      return null;
  }
}

function humanise(key: string): string {
  return key.replace(/_/g, ' ');
}
