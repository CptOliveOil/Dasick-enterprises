import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  extractJsonDetailed,
  parseStructured,
  describeSchema,
  rootIsObject,
} from '@/lib/integrations/ai/json';
import { youtubeResearchResponseSchema } from '@/schemas/youtube';

/**
 * The reported failure:
 *
 *   Structured output failed validation after one repair attempt.
 *   No JSON object found in the response.
 *
 * That one message covered three unrelated situations — prose, an empty reply,
 * and perfectly good JSON that ran out of output tokens before closing. Only
 * the last needs more room rather than a better prompt, so they are now
 * distinguished. Nothing here loosens the schema: an incomplete answer is still
 * refused, because storing half a research package as though it were whole is
 * the one outcome worse than failing.
 */

/* ------------------------------------------------------------------ */
/* What the model actually sent back                                   */
/* ------------------------------------------------------------------ */

describe('classifying a reply that could not be used', () => {
  it('recognises JSON cut off mid-object as truncation, not as missing JSON', () => {
    const cut =
      '{\n "overview": "The Porygon incident of December 1997 hospitalised hundreds",\n' +
      ' "facts": [\n  {"claim": "685 children were taken to hospital", "confid';
    const result = extractJsonDetailed(cut);
    expect(result.json).toBeNull();
    expect(result.failure).toBe('truncated');
  });

  it('recognises ordinary prose as prose', () => {
    const result = extractJsonDetailed(
      'I can certainly help you research the Porygon incident. It happened in 1997.',
    );
    expect(result.failure).toBe('no_json');
  });

  it('recognises an empty reply', () => {
    expect(extractJsonDetailed('').failure).toBe('empty');
    expect(extractJsonDetailed('   \n  ').failure).toBe('empty');
  });

  it('reads a fenced json block', () => {
    const text = 'Here is the package:\n```json\n{"overview":"x","hooks":["a"]}\n```\nHope that helps.';
    const result = extractJsonDetailed(text);
    expect(result.json).toBe('{"overview":"x","hooks":["a"]}');
  });

  it('reads a fence that was never closed', () => {
    const text = '```json\n{"overview":"x","hooks":["a"]}';
    expect(extractJsonDetailed(text).json).toBe('{"overview":"x","hooks":["a"]}');
  });

  it('finds the object even when prose before it contains a brace', () => {
    // The old scan locked onto the first `{` it saw and reported no JSON at all.
    const text =
      'The set {A, B} is discussed below. Here is the result:\n{"overview":"x","hooks":["a"]}';
    expect(extractJsonDetailed(text).json).toBe('{"overview":"x","hooks":["a"]}');
  });

  it('handles leading and trailing prose around one complete object', () => {
    const text = 'Sure!\n\n{"overview":"x","hooks":["a"]}\n\nLet me know if you need more.';
    expect(extractJsonDetailed(text).json).toBe('{"overview":"x","hooks":["a"]}');
  });

  it('keeps braces inside strings from confusing the balance', () => {
    const text = '{"overview":"a } brace in a string","hooks":["b"]}';
    expect(extractJsonDetailed(text).json).toBe(text);
  });

  it('reports invalid JSON separately from missing JSON', () => {
    const schema = z.object({ a: z.string() });
    const result = parseStructured('{"a": "b",}', schema);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('invalid_json');
  });

  it('reports a schema mismatch separately again', () => {
    const schema = z.object({ a: z.string() });
    const result = parseStructured('{"a": 42}', schema);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('schema');
  });
});

/* ------------------------------------------------------------------ */
/* Validation stays strict                                             */
/* ------------------------------------------------------------------ */

describe('validation is not weakened', () => {
  it('still refuses a research package missing required fields', () => {
    const result = parseStructured('{"overview":"too short"}', youtubeResearchResponseSchema);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('schema');
  });

  it('still refuses truncated JSON rather than salvaging half of it', () => {
    const half = '{"overview":"' + 'x'.repeat(60) + '","facts":[{"claim":"a"';
    const result = parseStructured(half, youtubeResearchResponseSchema);
    expect(result.ok).toBe(false);
    // Never ok. A half-written package must not reach the database looking whole.
    expect(result.data).toBeUndefined();
  });

  it('accepts a complete, valid package', () => {
    const good = JSON.stringify({
      overview: 'The Porygon incident of 16 December 1997 and what actually caused it.',
      facts: [{ claim: 'Hundreds were hospitalised', source: null, confidence: 'verified' }],
      hooks: ['One episode was pulled worldwide and never aired again.'],
    });
    const result = parseStructured(good, youtubeResearchResponseSchema);
    expect(result.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The instructions the model receives                                 */
/* ------------------------------------------------------------------ */

describe('schema instructions', () => {
  it('names every field the research schema requires', () => {
    const text = describeSchema(youtubeResearchResponseSchema, 'YoutubeResearchPackage');
    for (const field of [
      'overview',
      'facts',
      'statistics',
      'timeline',
      'viewer_questions',
      'competitor_coverage',
      'content_gaps',
      'hooks',
      'interesting_details',
      'risks',
      'uncertain_claims',
    ]) {
      expect(text, field).toContain(`"${field}"`);
    }
  });

  it('asks for a complete object rather than a long one', () => {
    const text = describeSchema(youtubeResearchResponseSchema, 'YoutubeResearchPackage');
    expect(text).toMatch(/complete/i);
    expect(text).toMatch(/cut off/i);
    expect(text).toMatch(/JSON only/i);
  });

  it('knows when a `{` prefill is valid for the schema', () => {
    expect(rootIsObject(youtubeResearchResponseSchema)).toBe(true);
    expect(rootIsObject(z.array(z.string()))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* End to end against a fake Anthropic client                          */
/* ------------------------------------------------------------------ */

/** Content blocks in the shape the SDK returns them. */
function reply(text: string, stopReason = 'end_turn', extraBlocks: unknown[] = []) {
  return {
    content: [...extraBlocks, { type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 200 },
    stop_reason: stopReason,
  };
}

/** Installs a fake SDK so no network call and no key are involved. */
async function providerWith(replies: unknown[]) {
  const create = vi.fn();
  for (const value of replies) create.mockResolvedValueOnce(value);

  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class {
      messages = { create };
    },
  }));
  vi.resetModules();
  const { AnthropicProvider } = await import('@/lib/integrations/ai/anthropic');
  return { provider: new AnthropicProvider('test-key-not-a-real-credential'), create };
}

const simple = z.object({ overview: z.string().min(3), hooks: z.array(z.string()).min(1) });

const GOOD = '"overview":"A complete package","hooks":["a hook"]}';

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('@anthropic-ai/sdk');
});

describe('the provider, end to end', () => {
  it('sends a `{` prefill so the model cannot open with prose', async () => {
    const { provider, create } = await providerWith([reply(GOOD)]);
    const result = await provider.generateStructured({
      system: 'You research things.',
      prompt: 'Research the Porygon incident.',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });

    expect(result.data.overview).toBe('A complete package');
    expect(result.repaired).toBe(false);

    const sent = create.mock.calls[0]![0] as {
      messages: { role: string; content: string }[];
      max_tokens: number;
    };
    expect(sent.messages.at(-1)).toEqual({ role: 'assistant', content: '{' });
    // And enough room for a real package.
    expect(sent.max_tokens).toBeGreaterThanOrEqual(8192);
  });

  it('raises the ceiling only upward, keeping a higher agent setting', async () => {
    const { provider, create } = await providerWith([reply(GOOD)]);
    await provider.generateStructured({
      system: 's',
      prompt: 'p',
      model: 'claude-sonnet-4-5',
      maxTokens: 12000,
      schema: simple,
      schemaName: 'Simple',
    });
    expect((create.mock.calls[0]![0] as { max_tokens: number }).max_tokens).toBe(12000);
  });

  it('repairs prose into JSON in exactly one extra call', async () => {
    const { provider, create } = await providerWith([
      reply('I can help you research that. Here is what I know...'),
      reply(GOOD),
    ]);
    const result = await provider.generateStructured({
      system: 's',
      prompt: 'p',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });

    expect(result.repaired).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    // Both calls are billed, and both are counted.
    expect(result.usage.output_tokens).toBe(400);
  });

  it('gives a truncated reply more room and asks for a shorter answer', async () => {
    const { provider, create } = await providerWith([
      reply('"overview":"cut off half way through', 'max_tokens'),
      reply(GOOD),
    ]);
    const result = await provider.generateStructured({
      system: 's',
      prompt: 'Research the Porygon incident.',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });

    expect(result.repaired).toBe(true);
    const firstTokens = (create.mock.calls[0]![0] as { max_tokens: number }).max_tokens;
    const repairCall = create.mock.calls[1]![0] as {
      max_tokens: number;
      messages: { role: string; content: string }[];
    };
    expect(repairCall.max_tokens).toBeGreaterThan(firstTokens);

    const repairPrompt = repairCall.messages[0]!.content;
    expect(repairPrompt).toMatch(/ran out of output tokens/i);
    expect(repairPrompt).toMatch(/shorter/i);
    // The original task is restated, so the model is not working from the
    // broken output alone.
    expect(repairPrompt).toMatch(/Porygon/);
    // And it is told not to continue the fragment.
    expect(repairPrompt).toMatch(/Start again/i);
  });

  it('shows a malformed reply back to the model, but not a truncated one', async () => {
    const { provider, create } = await providerWith([
      reply('Here is my answer in words rather than JSON, sorry about that.'),
      reply(GOOD),
    ]);
    await provider.generateStructured({
      system: 's',
      prompt: 'p',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });
    const repairPrompt = (
      create.mock.calls[1]![0] as { messages: { content: string }[] }
    ).messages[0]!.content;
    expect(repairPrompt).toMatch(/did not parse/i);
    expect(repairPrompt).toMatch(/words rather than JSON/);
  });

  it('reads text out of a multi-block reply and ignores the rest', async () => {
    const { provider } = await providerWith([
      reply(GOOD, 'end_turn', [{ type: 'thinking', thinking: 'considering the sources' }]),
    ]);
    const result = await provider.generateStructured({
      system: 's',
      prompt: 'p',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });
    expect(result.data.overview).toBe('A complete package');
  });

  it('fails cleanly when the repair fails too, after exactly two calls', async () => {
    const { provider, create } = await providerWith([
      reply('prose, not JSON'),
      reply('still prose, still not JSON'),
    ]);
    await expect(
      provider.generateStructured({
        system: 's',
        prompt: 'p',
        model: 'claude-sonnet-4-5',
        schema: simple,
        schemaName: 'Simple',
      }),
    ).rejects.toThrow(/failed validation after one repair attempt/i);
    // One repair attempt, never two.
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('says so plainly when the reply was still cut off after the retry', async () => {
    const { provider } = await providerWith([
      reply('"overview":"cut', 'max_tokens'),
      reply('"overview":"cut again', 'max_tokens'),
    ]);
    await expect(
      provider.generateStructured({
        system: 's',
        prompt: 'p',
        model: 'claude-sonnet-4-5',
        schema: simple,
        schemaName: 'Simple',
      }),
    ).rejects.toThrow(/still cut off/i);
  });

  it('fails cleanly on an empty reply', async () => {
    const { provider } = await providerWith([reply(''), reply('')]);
    await expect(
      provider.generateStructured({
        system: 's',
        prompt: 'p',
        model: 'claude-sonnet-4-5',
        schema: simple,
        schemaName: 'Simple',
      }),
    ).rejects.toThrow(/failed validation after one repair attempt/i);
  });

  it('never puts the prompt or the key into the diagnostics it logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { provider } = await providerWith([reply('prose'), reply(GOOD)]);
    await provider.generateStructured({
      system: 'SECRET SYSTEM PROMPT',
      prompt: 'SECRET USER PROMPT about a private topic',
      model: 'claude-sonnet-4-5',
      schema: simple,
      schemaName: 'Simple',
    });

    const logged = [...warn.mock.calls, ...info.mock.calls].flat().join(' ');
    expect(logged).not.toMatch(/SECRET/);
    expect(logged).not.toMatch(/test-key/);
    // But it does carry what is needed to diagnose the shape of the failure.
    expect(logged).toMatch(/stop=/);
    expect(logged).toMatch(/chars=/);
    expect(logged).toMatch(/blocks=/);
    expect(logged).toMatch(/failure=/);
    warn.mockRestore();
    info.mockRestore();
  });
});
