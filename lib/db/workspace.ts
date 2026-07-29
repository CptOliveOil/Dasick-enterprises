import 'server-only';
import { cookies } from 'next/headers';
import { getStore } from '@/lib/db';
import type { Business, BusinessKind } from '@/types/domain';

/** One cookie per kind, so switching channel does not also change the Etsy shop. */
export function workspaceCookieName(kind: BusinessKind): string {
  return `cc_workspace_${kind}`;
}

/**
 * Resolves the business backing a workspace module.
 *
 * Workspaces are keyed by *kind* rather than by a hard-coded id, so a second
 * YouTube channel or a new Etsy shop slots in without code changes. Once there
 * is more than one of a kind, a cookie set by the workspace switcher decides
 * which is in view; without one the oldest is used, so the choice is stable
 * across requests rather than dependent on row order.
 */
export async function getWorkspace(kind: BusinessKind) {
  const { store, ownerId, isDemo } = await getStore();
  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });
  const ofKind = businesses
    .filter((b) => b.kind === kind)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const business = await pick(ofKind, kind);

  return { store, ownerId, isDemo, business, businesses, siblings: ofKind };
}

async function pick(ofKind: Business[], kind: BusinessKind): Promise<Business | null> {
  if (ofKind.length === 0) return null;
  if (ofKind.length === 1) return ofKind[0]!;
  try {
    const selected = (await cookies()).get(workspaceCookieName(kind))?.value;
    // The cookie is only ever a hint. It is matched against businesses this
    // owner actually has, so a stale or forged value falls back to the default
    // rather than reaching anything it should not.
    const match = selected ? ofKind.find((b) => b.id === selected || b.slug === selected) : null;
    return match ?? ofKind[0]!;
  } catch {
    return ofKind[0]!;
  }
}
