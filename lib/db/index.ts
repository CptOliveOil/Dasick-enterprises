import 'server-only';
import { supabaseConfigured } from '@/lib/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MemoryStore } from './memory-store';
import { SupabaseStore } from './supabase-store';
import { DEMO_OWNER_ID, seedDemoData } from './seed';
import type { DataStore } from './tables';

/**
 * The memory store must survive Next.js hot reloads, otherwise every edit
 * wipes the running demo. Stash it on globalThis.
 */
const globalRef = globalThis as unknown as {
  __commandCentreStore?: MemoryStore;
  __commandCentreSeeding?: Promise<void>;
};

function memoryStore(): MemoryStore {
  if (!globalRef.__commandCentreStore) {
    globalRef.__commandCentreStore = new MemoryStore();
  }
  return globalRef.__commandCentreStore;
}

async function ensureSeeded(store: MemoryStore): Promise<void> {
  if (!globalRef.__commandCentreSeeding) {
    globalRef.__commandCentreSeeding = seedDemoData(store);
  }
  await globalRef.__commandCentreSeeding;
}

export interface StoreContext {
  store: DataStore;
  ownerId: string;
  /** True when running on the in-memory demo dataset. */
  isDemo: boolean;
}

/**
 * Resolves the data store for the current request.
 *
 * With Supabase configured, this returns a session-scoped client so Row Level
 * Security applies. Without it, the application runs on the seeded in-memory
 * store — fully functional, clearly labelled as demo data.
 */
export async function getStore(): Promise<StoreContext> {
  if (supabaseConfigured) {
    const client = await createSupabaseServerClient();
    if (client) {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (user) {
        return {
          store: new SupabaseStore(client),
          ownerId: user.id,
          isDemo: false,
        };
      }
    }
  }
  const store = memoryStore();
  await ensureSeeded(store);
  return { store, ownerId: DEMO_OWNER_ID, isDemo: true };
}

export { DEMO_OWNER_ID };
export type { DataStore } from './tables';
