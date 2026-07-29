import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { defaultBudget } from '@/lib/production/defaults';
import type { ProductionBudget } from '@/types/production';

export interface SpendCheck {
  /** True when the step may proceed without asking. */
  allowed: boolean;
  /** True when the operator must approve before any money is spent. */
  requiresApproval: boolean;
  /** True when a hard ceiling would be broken — approval cannot override it. */
  exceedsCeiling: boolean;
  reason: string;
  budget: ProductionBudget;
  spentSoFar: number;
}

export type SpendCategory = 'image' | 'video' | 'voice' | 'other';

/** Loads the business budget, creating the conservative default on first use. */
export async function getBudget(
  store: DataStore,
  ownerId: string,
  businessId: string,
  currency = 'GBP',
): Promise<ProductionBudget> {
  const existing = await store.list('production_budgets', {
    where: { owner_id: ownerId, business_id: businessId },
  });
  if (existing[0]) return existing[0];
  const budget = defaultBudget(ownerId, businessId, currency);
  await store.insert('production_budgets', budget);
  return budget;
}

/** Everything already spent producing one video, from recorded transactions. */
export async function videoSpend(
  store: DataStore,
  ownerId: string,
  videoId: string,
): Promise<number> {
  const [tasks, transactions] = await Promise.all([
    store.list('tasks', { where: { owner_id: ownerId } }),
    store.list('financial_transactions', { where: { owner_id: ownerId } }),
  ]);
  const taskIds = new Set(
    tasks.filter((t) => t.input.video_id === videoId).map((t) => t.id),
  );
  return Number(
    transactions
      .filter(
        (t) =>
          t.kind === 'ai_cost' &&
          ((t.reference_type === 'video' && t.reference_id === videoId) ||
            (t.reference_type === 'task' && t.reference_id && taskIds.has(t.reference_id))),
      )
      .reduce((sum, t) => sum + t.amount, 0)
      .toFixed(4),
  );
}

/**
 * Decides whether a step may spend.
 *
 * Three outcomes, in order of severity: over the per-video ceiling (blocked
 * outright), over the approval threshold (stops for the operator), or within
 * budget (proceeds). An agent never spends past a ceiling, with or without
 * approval.
 */
export async function checkSpend(
  store: DataStore,
  ownerId: string,
  businessId: string,
  videoId: string | null,
  category: SpendCategory,
  estimate: number,
): Promise<SpendCheck> {
  const budget = await getBudget(store, ownerId, businessId);
  const spentSoFar = videoId ? await videoSpend(store, ownerId, videoId) : 0;
  const projected = spentSoFar + estimate;

  const categoryCeiling =
    category === 'image'
      ? budget.max_image_spend
      : category === 'video'
        ? budget.max_video_spend
        : category === 'voice'
          ? budget.max_voice_spend
          : budget.max_cost_per_video;

  if (estimate > categoryCeiling) {
    return {
      allowed: false,
      requiresApproval: false,
      exceedsCeiling: true,
      reason: `Estimated ${category} spend of ${money(estimate)} exceeds the ${category} ceiling of ${money(categoryCeiling)}. Raise the budget in YouTube → Settings before continuing.`,
      budget,
      spentSoFar,
    };
  }

  if (projected > budget.max_cost_per_video) {
    return {
      allowed: false,
      requiresApproval: false,
      exceedsCeiling: true,
      reason: `This step would take the video to ${money(projected)}, above the ${money(budget.max_cost_per_video)} per-video ceiling. Raise the budget in YouTube → Settings before continuing.`,
      budget,
      spentSoFar,
    };
  }

  if (estimate >= budget.approval_threshold && estimate > 0) {
    return {
      allowed: false,
      requiresApproval: true,
      exceedsCeiling: false,
      reason: `Estimated spend of ${money(estimate)} is at or above your ${money(budget.approval_threshold)} approval threshold.`,
      budget,
      spentSoFar,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    exceedsCeiling: false,
    reason: '',
    budget,
    spentSoFar,
  };
}

function money(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
