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
    // Supabase is configured, so this workspace is real — and a real workspace
    // must never be silently served the seeded demo dataset. That fallback used
    // to exist here, and it is indistinguishable from data loss: every read
    // returns null with no error, so a script written moments earlier reads
    // back as "the record is gone".
    //
    // Failing here instead means an expired session shows a sign-in error,
    // which is what it is.
    throw new NotSignedIn();
  }
  const store = memoryStore();
  await ensureSeeded(store);
  return { store, ownerId: DEMO_OWNER_ID, isDemo: true };
}

/**
 * No usable session against a configured Supabase project.
 *
 * Its own type so routes can answer 401 rather than 500 — the request was fine,
 * the caller simply is not signed in any more.
 */
export class NotSignedIn extends Error {
  constructor() {
    super(
      'Your session has expired. Sign in again to continue — nothing was changed, and no demo data was substituted for your workspace.',
    );
    this.name = 'NotSignedIn';
  }
}

export { DEMO_OWNER_ID };
export type { DataStore } from './tables';
