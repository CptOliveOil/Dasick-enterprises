import type { z } from 'zod';

/**
 * Models sometimes wrap JSON in prose or a fenced block. Pull the first
 * balanced JSON object or array out of the text rather than failing outright.
 */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.search(/[{[]/);
  if (start === -1) return null;

  const open = candidate[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function parseStructured<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ParseResult<T> {
  const json = extractJson(text);
  if (!json) return { ok: false, error: 'No JSON object found in the response.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: `Response was not valid JSON: ${(error as Error).message}`,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Schema validation failed — ${issues}` };
  }
  return { ok: true, data: result.data };
}

/** Renders a Zod schema as instructions the model can follow. */
export function describeSchema(schema: z.ZodTypeAny, name: string): string {
  return [
    `Respond with a single JSON object matching the "${name}" schema.`,
    'Return JSON only — no prose, no code fences, no trailing commentary.',
    'Every required field must be present. Do not invent extra top-level fields.',
    schemaHint(schema),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * A compact structural hint. Full JSON Schema generation is overkill here — the
 * shape plus strict validation on the way back is enough.
 */
function schemaHint(schema: z.ZodTypeAny, depth = 0): string {
  if (depth > 4) return '…';
  const def = schema._def as { typeName?: string; [key: string]: unknown };
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
      const entries = Object.entries(shape).map(
        ([key, value]) => `${'  '.repeat(depth + 1)}"${key}": ${schemaHint(value, depth + 1)}`,
      );
      return `{\n${entries.join(',\n')}\n${'  '.repeat(depth)}}`;
    }
    case 'ZodArray':
      return `[${schemaHint(def.type as z.ZodTypeAny, depth)}]`;
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodEnum':
      return (def.values as string[]).map((v) => `"${v}"`).join(' | ');
    case 'ZodNullable':
      return `${schemaHint(def.innerType as z.ZodTypeAny, depth)} | null`;
    case 'ZodOptional':
    case 'ZodDefault':
      return schemaHint(def.innerType as z.ZodTypeAny, depth);
    case 'ZodRecord':
      return '{ [key: string]: any }';
    case 'ZodUnknown':
    case 'ZodAny':
      return 'any';
    default:
      return 'any';
  }
}
