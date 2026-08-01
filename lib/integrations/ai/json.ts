import type { z } from 'zod';

/**
 * Getting a validated object out of a model's reply.
 *
 * The failure that prompted this rewrite read:
 *
 *   Structured output failed validation after one repair attempt.
 *   No JSON object found in the response.
 *
 * That one sentence covered three completely different situations — the model
 * wrote prose, the model wrote nothing, or the model wrote perfectly good JSON
 * that ran out of output tokens before closing its last brace. They need
 * different fixes and only one of them is the model's fault, so the categories
 * are now distinguished and reported.
 *
 * Extraction is deliberately generous about *packaging* and strict about
 * *content*: fences, preamble and multiple candidate objects are all handled,
 * and then Zod validates with no leniency at all. Loosening the schema to
 * accept a half-written answer would be the one change that actually costs
 * something — it would put unfinished research into the database looking
 * finished.
 */

/**
 * Why a reply could not be used.
 *
 * `truncated` is the important one: it means the model was doing the right
 * thing and was cut off, so the remedy is more room rather than a better
 * prompt.
 */
export type ExtractionFailure =
  | 'empty'
  | 'no_json'
  | 'truncated'
  | 'invalid_json'
  | 'schema';

export interface ExtractResult {
  json: string | null;
  failure?: ExtractionFailure;
}

/** Scans one candidate for a balanced object or array. */
function balanced(candidate: string): ExtractResult {
  const start = candidate.search(/[{[]/);
  if (start === -1) return { json: null, failure: 'no_json' };

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
      if (depth === 0) return { json: candidate.slice(start, i + 1) };
    }
  }

  // An opening brace that never closed. The model started correctly and was cut
  // off — almost always the output token limit, occasionally a dropped stream.
  return { json: null, failure: 'truncated' };
}

/**
 * Every place a JSON object might be hiding, in the order worth trying.
 *
 * Fenced blocks first, because when a model uses one it is unambiguous. Then
 * the whole reply. Then each `{` in turn, which matters because prose can
 * contain a brace long before the real object starts — a single "first brace"
 * scan locks onto that and reports no JSON at all.
 */
function candidates(text: string): string[] {
  const trimmed = text.trim();
  const out: string[] = [];

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const body = match[1]?.trim();
    if (body) out.push(body);
  }
  // A fence that was opened and never closed, which is what a truncated fenced
  // reply looks like.
  const unclosed = trimmed.match(/```(?:json)?\s*([\s\S]*)$/);
  if (unclosed?.[1] && !out.includes(unclosed[1].trim())) out.push(unclosed[1].trim());

  out.push(trimmed);

  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '{' || trimmed[i] === '[') out.push(trimmed.slice(i));
  }
  return out;
}

export function extractJsonDetailed(text: string): ExtractResult {
  if (!text || text.trim() === '') return { json: null, failure: 'empty' };

  let sawTruncation = false;
  let malformed: string | null = null;

  for (const candidate of candidates(text)) {
    const result = balanced(candidate);
    if (result.json) {
      // Balanced is not the same as parseable. Prose can be balanced — "the set
      // {A, B}" has a brace that closes — so a candidate only counts once it
      // actually parses, and otherwise the search continues.
      try {
        JSON.parse(result.json);
        return result;
      } catch {
        // Kept, because a complete-but-malformed object is a more useful
        // diagnosis than "no JSON found", and the caller can report the real
        // syntax error from it.
        malformed ??= result.json;
        continue;
      }
    }
    if (result.failure === 'truncated') sawTruncation = true;
  }

  if (malformed) return { json: malformed, failure: 'invalid_json' };
  // Truncation outranks "no json": an object that started and never finished is
  // a different problem from a reply that never contained one.
  return { json: null, failure: sawTruncation ? 'truncated' : 'no_json' };
}

/** Kept for callers that only want the string. */
export function extractJson(text: string): string | null {
  return extractJsonDetailed(text).json;
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Why it failed, for diagnostics and for choosing how to repair. */
  failure?: ExtractionFailure;
}

const FAILURE_MESSAGE: Record<ExtractionFailure, string> = {
  empty: 'The model returned an empty response.',
  no_json:
    'No JSON object found in the response — the model replied with prose instead of JSON.',
  truncated:
    'The JSON was cut off before it finished. The response ran out of output tokens.',
  invalid_json: 'The response was not valid JSON.',
  schema: 'The JSON did not match the required schema.',
};

export function parseStructured<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ParseResult<T> {
  const extracted = extractJsonDetailed(text);
  if (!extracted.json) {
    const failure = extracted.failure ?? 'no_json';
    return { ok: false, failure, error: FAILURE_MESSAGE[failure] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return {
      ok: false,
      failure: 'invalid_json',
      error: `${FAILURE_MESSAGE.invalid_json} ${(error as Error).message}`,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, failure: 'schema', error: `Schema validation failed — ${issues}` };
  }
  return { ok: true, data: result.data };
}

/** Renders a Zod schema as instructions the model can follow. */
export function describeSchema(schema: z.ZodTypeAny, name: string): string {
  return [
    `Respond with a single JSON object matching the "${name}" schema.`,
    'Return JSON only — no prose, no code fences, no trailing commentary.',
    'Every required field must be present. Do not invent extra top-level fields.',
    '',
    'Shape:',
    schemaHint(schema),
    '',
    'Length matters as much as shape. The response must be a *complete* JSON',
    'object: if it is cut off before the final closing brace it is unusable and',
    'the work is wasted. Prefer fewer, better entries in each array over many',
    'thin ones, and keep individual strings tight. Completeness beats volume.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** True when the schema's root is an object, so a `{` prefill is valid. */
export function rootIsObject(schema: z.ZodTypeAny): boolean {
  const def = schema._def as { typeName?: string; innerType?: z.ZodTypeAny };
  if (def.typeName === 'ZodObject') return true;
  if (def.innerType) return rootIsObject(def.innerType);
  return false;
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
