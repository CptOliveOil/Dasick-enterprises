import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { config, supabaseConfigured } from '@/lib/config';

/**
 * Request-scoped client that carries the signed-in user's session, so Row
 * Level Security applies. Returns null when Supabase is not configured.
 */
export async function createSupabaseServerClient() {
  if (!supabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(config.supabase.url!, config.supabase.anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — the middleware refreshes sessions.
        }
      },
    },
  });
}

/**
 * Service-role client, used only for trusted server work (seeding, background
 * agent runs). Never expose this to a request that a browser controls without
 * first checking the caller's identity.
 */
export function createSupabaseServiceClient() {
  if (!config.supabase.url || !config.supabase.serviceKey) return null;
  return createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
