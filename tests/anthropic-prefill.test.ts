import { describe, expect, it } from 'vitest';
import { acceptsPrefill } from '@/lib/integrations/ai/anthropic';

describe('assistant prefill', () => {
  it('is used on the models that accept it', () => {
    for (const model of ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-5-20250929', 'claude-opus-4-1']) {
      expect(acceptsPrefill(model), model).toBe(true);
    }
  });

  it('is never sent to 4.6+ or 5.x models, which reject it with a 400', () => {
    for (const model of ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'something-new']) {
      expect(acceptsPrefill(model), model).toBe(false);
    }
  });
});
