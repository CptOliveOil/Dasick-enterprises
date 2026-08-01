import 'server-only';
import { NextResponse } from 'next/server';
import { getStore, DEMO_OWNER_ID, NotSignedIn } from '@/lib/db';
import { config } from '@/lib/config';
import type { DataStore } from '@/lib/db/tables';
import type { AccountRole, Profile } from '@/types/domain';
import { can, type Permission } from './permissions';

export interface Session {
  store: DataStore;
  ownerId: string;
  profile: Profile;
  role: AccountRole;
  /** True when running on the seeded in-memory dataset with no real account. */
  isDemo: boolean;
}

/**
 * The one place that answers "who is this and what may they do".
 *
 * In real account mode the caller is an authenticated Supabase user and the
 * profile row is the authority on their role. In demo mode there is no account
 * system at all — the app runs on the in-memory dataset — so a synthetic owner
 * profile stands in. That distinction is surfaced as `isDemo`, never blurred:
 * `getStore()` has already decided which storage driver is in play, and this
 * only reports it.
 */
export async function getSession(): Promise<Session> {
  const { store, ownerId, isDemo } = await getStore();
  const profile = await loadProfile(store, ownerId, isDemo);
  return { store, ownerId, profile, role: profile.role, isDemo };
}

async function loadProfile(
  store: DataStore,
  ownerId: string,
  isDemo: boolean,
): Promise<Profile> {
  const existing = await store.get('profiles', ownerId).catch(() => null);
  if (existing) return normalise(existing);

  const timestamp = new Date().toISOString();
  const fallback: Profile = {
    id: ownerId,
    email: isDemo ? 'demo@command-centre.local' : '',
    display_name: isDemo ? 'Demo Operator' : 'Operator',
    avatar_url: null,
    // The first (and, today, only) profile on an account is its owner.
    role: 'owner',
    timezone: 'Europe/London',
    currency: config.currency,
    created_at: timestamp,
    updated_at: timestamp,
  };

  // In demo mode the row is created so Account settings has something real to
  // edit. Against Supabase the row is created by the sign-up trigger; if it is
  // somehow missing we return the fallback rather than writing through RLS.
  if (isDemo) {
    try {
      return await store.insert('profiles', fallback);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Older rows predate the role/timezone columns. Fill them in rather than crash. */
function normalise(profile: Profile): Profile {
  return {
    ...profile,
    avatar_url: profile.avatar_url ?? null,
    role: profile.role ?? 'owner',
    timezone: profile.timezone || 'Europe/London',
    currency: profile.currency || config.currency,
    updated_at: profile.updated_at ?? profile.created_at,
  };
}

export class PermissionError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Your role does not allow this (${permission}).`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

/**
 * Resolves the session and checks a permission in one step.
 *
 * Every route that changes something calls this. Throwing rather than returning
 * a flag means a forgotten check is a crash in development, not a silent hole.
 */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await getSession();
  if (!can(session.role, permission)) throw new PermissionError(permission);
  return session;
}

/**
 * Route wrapper: turns a `PermissionError` into a 403 and anything else into a
 * 500 with its message, so handlers can just `await requirePermission(...)`.
 */
export async function withPermission<T>(
  permission: Permission,
  handler: (session: Session) => Promise<T>,
): Promise<T | NextResponse> {
  let session: Session;
  try {
    session = await requirePermission(permission);
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // An expired session against a real workspace. 401, not 500 — and never a
    // silent switch to demo data, which is what used to happen here.
    if (error instanceof NotSignedIn) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
  return handler(session);
}

/**
 * Guard for routes that already have their own body shape.
 *
 * Returns the session on success and a 403 response on refusal, so a handler
 * reads as `const guard = await guardPermission(...); if ('response' in guard)
 * return guard.response;` and carries on with `guard.store` / `guard.ownerId`
 * exactly as it did with `getStore()`.
 */
export async function guardPermission(
  permission: Permission,
): Promise<Session | { response: NextResponse }> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof PermissionError) {
      return { response: NextResponse.json({ error: error.message }, { status: 403 }) };
    }
    if (error instanceof NotSignedIn) {
      return { response: NextResponse.json({ error: error.message }, { status: 401 }) };
    }
    throw error;
  }
}

export { DEMO_OWNER_ID };
