import 'server-only';
import { anthropicConfigured } from '@/lib/config';
import type { AIProviderId } from '@/types/domain';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import type { AIProvider } from './types';

let anthropic: AnthropicProvider | null = null;
const mock = new MockProvider();

/**
 * Resolves the provider an agent should run on.
 *
 * Falls back to the mock provider when the requested provider has no
 * credentials — the workforce keeps running and the output is clearly marked as
 * simulated, rather than the whole mission failing.
 */
export function getProvider(id: AIProviderId): AIProvider {
  switch (id) {
    case 'anthropic': {
      if (!anthropicConfigured) return mock;
      anthropic ??= new AnthropicProvider();
      return anthropic;
    }
    case 'openai':
    case 'google':
      // Adapters land here. Until then agents assigned to them run simulated.
      return mock;
    case 'mock':
    default:
      return mock;
  }
}

export function providerIsLive(id: AIProviderId): boolean {
  return id === 'anthropic' && anthropicConfigured;
}

export { MockProvider, AnthropicProvider };
export * from './types';
