import 'server-only';
import { anthropicConfigured, isDemoMode } from '@/lib/config';
import type { AIProviderId } from '@/types/domain';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import type { AIProvider } from './types';

let anthropic: AnthropicProvider | null = null;
const mock = new MockProvider();

/**
 * A real workspace asked to run an agent with no provider behind it.
 *
 * Its own class so the engine can tell it apart from a bug and report it as
 * what it is: a missing connection the operator can fix in a minute, not a
 * failure of the work.
 */
export class ProviderNotConnected extends Error {
  constructor(
    readonly providerId: AIProviderId,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderNotConnected';
  }
}

/**
 * Whether a missing AI provider may be stood in for.
 *
 * Only in Demo Mode. This is the same rule the media providers already follow
 * (`simulationAllowed` in lib/integrations/providers/registry.ts), and it is
 * the rule that matters most: a real workspace that quietly returned invented
 * text where it promised a model's answer would be worse than one that stopped,
 * because the operator would have no way to tell the difference.
 */
export function aiSimulationAllowed(): boolean {
  return isDemoMode();
}

const NOT_CONNECTED: Record<string, string> = {
  anthropic:
    'Anthropic is not connected. Add ANTHROPIC_API_KEY to .env.local and restart the app. ' +
    'Nothing was simulated — this workspace is real, so a missing provider stops the task rather than inventing an answer.',
  openai:
    'OpenAI is not connected, and Command Centre has no OpenAI adapter yet. ' +
    'Move this agent to Anthropic in its settings, or run it in Demo Mode.',
  google:
    'Google AI is not connected, and Command Centre has no Google adapter yet. ' +
    'Move this agent to Anthropic in its settings, or run it in Demo Mode.',
};

/**
 * Resolves the provider an agent should run on.
 *
 * One path, deliberately. In Demo Mode a missing provider falls back to the
 * simulated one so the whole pipeline still runs end to end and everything it
 * produces is prefixed `[Simulated]`. In a real workspace it throws instead,
 * and the engine turns that into a failed task naming exactly what is missing.
 */
export function resolveProvider(id: AIProviderId): AIProvider {
  if (id === 'mock') return mock;
  if (id === 'anthropic' && anthropicConfigured) {
    anthropic ??= new AnthropicProvider();
    return anthropic;
  }
  if (aiSimulationAllowed()) return mock;
  throw new ProviderNotConnected(
    id,
    NOT_CONNECTED[id] ?? `${id} is not connected, and nothing may be simulated in a real workspace.`,
  );
}

/** True when calls to this provider reach a real model. */
export function providerIsLive(id: AIProviderId): boolean {
  return id === 'anthropic' && anthropicConfigured;
}

export { MockProvider, AnthropicProvider };
export * from './types';
