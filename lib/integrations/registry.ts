import { stableId } from '@/lib/ids';
import type { IntegrationConnection, IntegrationKind } from '@/types/domain';

export interface IntegrationDefinition {
  key: string;
  kind: IntegrationKind;
  provider: string;
  label: string;
  required_env: string[];
  notes: string;
}

/**
 * Every integration the application knows about. Connection state is *derived*
 * from whether the required environment variables are actually set on the
 * server — an integration is never displayed as connected because a row says so.
 */
export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  {
    key: 'anthropic',
    kind: 'ai',
    provider: 'Anthropic Claude',
    label: 'Primary AI provider',
    required_env: ['ANTHROPIC_API_KEY'],
    notes:
      'Powers every agent. Without it the workforce runs on the mock provider, which returns clearly-labelled placeholder output.',
  },
  {
    key: 'openai',
    kind: 'ai',
    provider: 'OpenAI',
    label: 'Alternative AI provider',
    required_env: ['OPENAI_API_KEY'],
    notes: 'Optional. Individual agents can be pointed at this provider once configured.',
  },
  {
    key: 'google',
    kind: 'ai',
    provider: 'Google Gemini',
    label: 'Alternative AI provider',
    required_env: ['GOOGLE_AI_API_KEY'],
    notes: 'Optional. Individual agents can be pointed at this provider once configured.',
  },
  {
    key: 'youtube',
    kind: 'youtube',
    provider: 'YouTube Data API',
    label: 'Channel analytics and metadata',
    required_env: ['YOUTUBE_API_KEY'],
    notes:
      'Until connected, analytics screens show recorded demo data only and never claim to be live.',
  },
  {
    key: 'etsy',
    kind: 'etsy',
    provider: 'Etsy Open API',
    label: 'Shop, listing and order data',
    required_env: ['ETSY_API_KEY'],
    notes: 'Required before any listing can be published. Publishing always requires approval as well.',
  },
  {
    key: 'voice',
    kind: 'voice',
    provider: 'Voice provider',
    label: 'Narration generation',
    required_env: ['VOICE_PROVIDER', 'VOICE_PROVIDER_API_KEY'],
    notes: 'Any provider implementing the VoiceProvider interface in lib/integrations.',
  },
  {
    key: 'image',
    kind: 'image',
    provider: 'Image provider',
    label: 'Thumbnail and scene imagery',
    required_env: ['IMAGE_PROVIDER', 'IMAGE_PROVIDER_API_KEY'],
    notes: 'Any provider implementing the ImageProvider interface in lib/integrations.',
  },
  {
    key: 'video',
    kind: 'video',
    provider: 'Video provider',
    label: 'Scene video generation',
    required_env: ['VIDEO_PROVIDER', 'VIDEO_PROVIDER_API_KEY'],
    notes: 'Any provider implementing the VideoProvider interface in lib/integrations.',
  },
];

function envPresent(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

/** Builds connection rows with an honest `connected` flag. */
export function resolveIntegrations(
  definitions: IntegrationDefinition[] = INTEGRATION_DEFINITIONS,
): IntegrationConnection[] {
  return definitions.map((def) => ({
    id: stableId(`integration:${def.key}`),
    owner_id: stableId('owner:demo'),
    kind: def.kind,
    provider: def.provider,
    label: def.label,
    connected: def.required_env.every(envPresent),
    required_env: def.required_env,
    notes: def.notes,
    created_at: '2024-01-01T00:00:00.000Z',
  }));
}
