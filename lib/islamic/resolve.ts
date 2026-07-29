import type { DataStore } from '@/lib/db/tables';
import type { SourcePolicy, VisualRules } from '@/types/islamic';
import { defaultSourcePolicy, defaultVisualRules } from './policy';

/**
 * Loads a business' source policy and visual rules, creating the cautious
 * defaults on first use.
 *
 * Scoped to the business, never to "the YouTube workspace". A channel's
 * editorial policy belongs to that channel; two channels under one account must
 * not share one.
 */
export async function getSourcePolicy(
  store: DataStore,
  ownerId: string,
  businessId: string,
): Promise<SourcePolicy> {
  const existing = await store.list('source_policies', {
    where: { owner_id: ownerId, business_id: businessId },
  });
  if (existing[0]) return existing[0];
  const policy = defaultSourcePolicy(ownerId, businessId);
  await store.insert('source_policies', policy);
  return policy;
}

export async function getVisualRules(
  store: DataStore,
  ownerId: string,
  businessId: string,
): Promise<VisualRules> {
  const existing = await store.list('visual_rules', {
    where: { owner_id: ownerId, business_id: businessId },
  });
  if (existing[0]) return existing[0];
  const rules = defaultVisualRules(ownerId, businessId);
  await store.insert('visual_rules', rules);
  return rules;
}

/**
 * Whether a business is running Islamic content.
 *
 * Keyed on the agents actually assigned to it rather than on a name or a flag,
 * so the visual and source constraints follow the workforce that is genuinely
 * doing religious work — including on a channel the operator created and named
 * anything they liked.
 */
export async function usesIslamicWorkforce(
  store: DataStore,
  ownerId: string,
  businessId: string | null,
): Promise<boolean> {
  if (!businessId) return false;
  const agents = await store.list('agents', { where: { owner_id: ownerId } });
  return agents.some(
    (agent) =>
      agent.business_id === businessId &&
      agent.archived_at === null &&
      agent.capabilities.some((capability) => capability.startsWith('islamic.')),
  );
}

/**
 * Policy and rules for a business, but only when that business is doing Islamic
 * work. Returns nulls otherwise, so the general YouTube pipeline is untouched.
 */
export async function islamicContext(
  store: DataStore,
  ownerId: string,
  businessId: string | null,
): Promise<{ policy: SourcePolicy | null; rules: VisualRules | null }> {
  if (!(await usesIslamicWorkforce(store, ownerId, businessId))) {
    return { policy: null, rules: null };
  }
  const [policy, rules] = await Promise.all([
    getSourcePolicy(store, ownerId, businessId!),
    getVisualRules(store, ownerId, businessId!),
  ]);
  return { policy, rules };
}
