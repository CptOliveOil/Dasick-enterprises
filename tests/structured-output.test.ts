import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson, parseStructured } from '@/lib/integrations/ai/json';
import { MockProvider } from '@/lib/integrations/ai/mock';
import {
  factCheckResponseSchema,
  youtubeIdeasResponseSchema,
  youtubeScriptResponseSchema,
} from '@/schemas/youtube';
import { etsyListingResponseSchema } from '@/schemas/etsy';
import { managerPlanSchema } from '@/schemas/manager';

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('reads a fenced block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps.')).toBe('{"a":1}');
  });

  it('reads an object surrounded by prose', () => {
    expect(extractJson('Sure. {"a": {"b": 2}} Done.')).toBe('{"a": {"b": 2}}');
  });

  it('is not fooled by braces inside strings', () => {
    const text = 'x {"a": "a } brace", "b": 1} y';
    expect(extractJson(text)).toBe('{"a": "a } brace", "b": 1}');
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});

describe('parseStructured', () => {
  const schema = z.object({ name: z.string().min(3), count: z.number().int() });

  it('accepts valid output', () => {
    const result = parseStructured('{"name":"agent","count":2}', schema);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ name: 'agent', count: 2 });
  });

  it('rejects output that violates the schema, and says why', () => {
    const result = parseStructured('{"name":"a","count":2}', schema);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('name');
  });

  it('rejects malformed JSON rather than guessing', () => {
    const result = parseStructured('{"name": ', schema);
    expect(result.ok).toBe(false);
  });

  it('never returns partial data on failure', () => {
    const result = parseStructured('{"count": 2}', schema);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });
});

describe('MockProvider', () => {
  const provider = new MockProvider();

  const cases: [string, z.ZodType<unknown, z.ZodTypeDef, unknown>][] = [
    ['YoutubeIdeas', youtubeIdeasResponseSchema],
    ['YoutubeScript', youtubeScriptResponseSchema],
    ['FactCheck', factCheckResponseSchema],
    ['EtsyListing', etsyListingResponseSchema],
    ['ManagerPlan', managerPlanSchema],
  ];

  it.each(cases)('synthesises schema-valid output for %s', async (name, schema) => {
    const result = await provider.generateStructured({
      system: 'test',
      prompt: 'test',
      model: 'mock',
      schema,
      schemaName: name,
    });
    // The point of the mock is that the real pipeline runs: if it produced
    // anything invalid, the agent engine would mark the task failed.
    expect(schema.safeParse(result.data).success).toBe(true);
  });

  it('marks its output as simulated so it cannot pass for real', async () => {
    const result = await provider.generateStructured({
      system: 'test',
      prompt: 'test',
      model: 'mock',
      schema: youtubeIdeasResponseSchema,
      schemaName: 'YoutubeIdeas',
    });
    expect(result.data.ideas[0]!.title).toContain('[Simulated]');
  });

  it('reports zero cost, because nothing was spent', async () => {
    const result = await provider.generateText({ system: '', prompt: 'x', model: 'mock' });
    expect(result.usage.estimated_cost).toBe(0);
  });
});
