import 'server-only';
import { getStore } from '@/lib/db';
import type { BusinessKind } from '@/types/domain';

/**
 * Resolves the business backing a workspace module. Workspaces are keyed by
 * kind rather than by a hard-coded id, so a second YouTube channel or a new
 * Etsy shop slots in without code changes.
 */
export async function getWorkspace(kind: BusinessKind) {
  const { store, ownerId, isDemo } = await getStore();
  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });
  const business = businesses.find((b) => b.kind === kind) ?? null;
  return { store, ownerId, isDemo, business, businesses };
}
