/**
 * Server-side configuration. Nothing here is imported by client components —
 * provider keys must never reach the browser.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const config = {
  supabase: {
    url: env('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },
  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5',
  },
  openai: { apiKey: env('OPENAI_API_KEY') },
  google: { apiKey: env('GOOGLE_AI_API_KEY') },
  youtube: { apiKey: env('YOUTUBE_API_KEY') },
  etsy: { apiKey: env('ETSY_API_KEY') },
  voice: { apiKey: env('VOICE_PROVIDER_API_KEY'), provider: env('VOICE_PROVIDER') },
  image: { apiKey: env('IMAGE_PROVIDER_API_KEY'), provider: env('IMAGE_PROVIDER') },
  video: { apiKey: env('VIDEO_PROVIDER_API_KEY'), provider: env('VIDEO_PROVIDER') },
  currency: env('DEFAULT_CURRENCY') ?? 'GBP',
} as const;

/** Supabase is only usable when both the URL and anon key are present. */
export const supabaseConfigured = Boolean(
  config.supabase.url && config.supabase.anonKey,
);

/** True when real Claude calls are possible. Otherwise agents run on the mock provider. */
export const anthropicConfigured = Boolean(config.anthropic.apiKey);

/**
 * Demo mode: no database credentials, so the app runs on the in-memory store
 * seeded with clearly-labelled demo data. Everything still works end to end.
 */
export const demoMode = !supabaseConfigured;
