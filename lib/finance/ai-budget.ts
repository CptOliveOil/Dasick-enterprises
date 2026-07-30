import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import type { AiBudget, AiSpendDecision } from '@/types/budget';

/**
 * The account-level AI spending control.
 *
 * Everything here is deliberately conservative in one direction: when the
 * answer is unclear, nothing spends. There is no default ceiling, no implicit
 * activation, and no path by which a run can raise its own limit — the only
 * writer of this table is an owner-guarded settings route.
 */

/** Rounded the way money is, not the way floats are. */
function money(value: number, currency = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${value.toFixed(2)}`;
}

/** First instant of the calendar month containing `at`, in UTC. */
export function monthStart(at: Date = new Date()): string {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString();
}

/** The budget, or null when the owner has not set one yet. */
export async function getAiBudget(
  store: DataStore,
  ownerId: string,
): Promise<AiBudget | null> {
  const rows = await store.list('ai_budgets', { where: { owner_id: ownerId } });
  return rows[0] ?? null;
}

/**
 * Model spend already recorded this calendar month.
 *
 * Read from `api_usage`, which the engine writes after every model call, so
 * this is what was actually spent rather than what was expected to be.
 */
export async function monthToDateSpend(
  store: DataStore,
  ownerId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = monthStart(now);
  const rows = await store.list('api_usage', { where: { owner_id: ownerId } });
  return round(
    rows.filter((row) => row.created_at >= since).reduce((sum, row) => sum + row.estimated_cost, 0),
  );
}

/** Model spend already recorded against one mission, across all its tasks. */
export async function missionSpend(
  store: DataStore,
  ownerId: string,
  missionId: string,
): Promise<number> {
  const [tasks, usage] = await Promise.all([
    store.list('tasks', { where: { owner_id: ownerId, mission_id: missionId } }),
    store.list('api_usage', { where: { owner_id: ownerId } }),
  ]);
  const taskIds = new Set(tasks.map((task) => task.id));
  return round(
    usage
      .filter((row) => row.task_id && taskIds.has(row.task_id))
      .reduce((sum, row) => sum + row.estimated_cost, 0),
  );
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Decides whether one model call may go ahead.
 *
 * Checked in order of severity, because the operator should be told the most
 * serious reason rather than the first one found: no budget at all, then the
 * monthly ceiling, then the mission ceiling, then the per-step approval
 * threshold. Only then does a call proceed.
 *
 * `estimate` is what the call is expected to cost. It is an estimate — the
 * recorded figure afterwards is the real one — so the ceilings are checked
 * against *projected* totals and the estimate is deliberately allowed to be
 * pessimistic.
 */
export async function checkAiSpend(
  store: DataStore,
  ownerId: string,
  {
    estimate,
    missionId,
    now = new Date(),
  }: { estimate: number; missionId: string | null; now?: Date },
): Promise<AiSpendDecision> {
  const budget = await getAiBudget(store, ownerId);

  if (!budget || !budget.activated_at) {
    return {
      allowed: false,
      requiresApproval: false,
      exceedsCeiling: false,
      notActivated: true,
      reason:
        'No monthly AI budget has been set for this workspace, so nothing may spend yet. ' +
        'Open Settings → AI budget, choose a monthly ceiling you are comfortable with, and turn real execution on. ' +
        'Command Centre deliberately has no default figure — a limit you did not choose is not a limit.',
      budget,
      spentThisMonth: 0,
      spentThisMission: 0,
      remaining: null,
      warning: false,
    };
  }

  const [spentThisMonth, spentThisMission] = await Promise.all([
    monthToDateSpend(store, ownerId, now),
    missionId ? missionSpend(store, ownerId, missionId) : Promise.resolve(0),
  ]);
  const remaining = round(budget.monthly_ceiling - spentThisMonth);
  const warning = spentThisMonth >= budget.monthly_ceiling * (budget.warn_at_percent / 100);
  const base = { budget, spentThisMonth, spentThisMission, remaining, warning };

  if (spentThisMonth + estimate > budget.monthly_ceiling) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      exceedsCeiling: true,
      notActivated: false,
      reason:
        `This step would take this month's AI spend to ${money(spentThisMonth + estimate, budget.currency)}, ` +
        `above your ${money(budget.monthly_ceiling, budget.currency)} monthly ceiling ` +
        `(${money(spentThisMonth, budget.currency)} already spent). ` +
        'Nothing has been charged. Raise the ceiling in Settings → AI budget, or wait for the new month.',
    };
  }

  if (missionId && spentThisMission + estimate > budget.per_mission_ceiling) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      exceedsCeiling: true,
      notActivated: false,
      reason:
        `This step would take the mission to ${money(spentThisMission + estimate, budget.currency)}, ` +
        `above your ${money(budget.per_mission_ceiling, budget.currency)} per-mission ceiling. ` +
        'Nothing has been charged. Raise the per-mission ceiling in Settings → AI budget, or start a smaller mission.',
    };
  }

  if (estimate >= budget.approval_over) {
    return {
      ...base,
      allowed: false,
      requiresApproval: true,
      exceedsCeiling: false,
      notActivated: false,
      reason:
        `This step is estimated at ${money(estimate, budget.currency)}, at or above your ` +
        `${money(budget.approval_over, budget.currency)} approval threshold. Approving authorises this step only.`,
    };
  }

  return {
    ...base,
    allowed: true,
    requiresApproval: false,
    exceedsCeiling: false,
    notActivated: false,
    reason: warning
      ? `Within budget, but ${money(spentThisMonth, budget.currency)} of ${money(budget.monthly_ceiling, budget.currency)} is already spent this month.`
      : 'Within budget.',
  };
}

export interface AiBudgetInput {
  currency: string;
  monthly_ceiling: number;
  warn_at_percent: number;
  per_mission_ceiling: number;
  approval_over: number;
  /** True to turn paid execution on. False leaves it off without losing the figures. */
  activate: boolean;
}

/**
 * Creates or replaces the budget.
 *
 * `updatedBy` is required and is always a profile id, never an agent. The only
 * caller is the owner-guarded settings route; nothing in the capability
 * registry can reach this function, which is what makes an agent unable to
 * raise its own ceiling a structural fact rather than an intention.
 */
export async function setAiBudget(
  store: DataStore,
  ownerId: string,
  updatedBy: string,
  input: AiBudgetInput,
): Promise<AiBudget> {
  const timestamp = new Date().toISOString();
  const existing = await getAiBudget(store, ownerId);

  const activated_at = input.activate ? (existing?.activated_at ?? timestamp) : null;

  if (existing) {
    return store.update('ai_budgets', existing.id, {
      currency: input.currency,
      monthly_ceiling: input.monthly_ceiling,
      warn_at_percent: input.warn_at_percent,
      per_mission_ceiling: input.per_mission_ceiling,
      approval_over: input.approval_over,
      activated_at,
      updated_by: updatedBy,
      updated_at: timestamp,
    });
  }

  return store.insert('ai_budgets', {
    id: uuid(),
    owner_id: ownerId,
    currency: input.currency,
    monthly_ceiling: input.monthly_ceiling,
    warn_at_percent: input.warn_at_percent,
    per_mission_ceiling: input.per_mission_ceiling,
    approval_over: input.approval_over,
    activated_at,
    updated_by: updatedBy,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

/**
 * A pessimistic estimate of what one call will cost, before it is made.
 *
 * Deliberately assumes the agent uses its whole output allowance and that the
 * prompt is large. An estimate that is too high stops a step the operator can
 * then approve; one that is too low lets a ceiling be passed silently, which is
 * the failure that costs money.
 */
export function estimateCallCost(
  model: string,
  maxTokens: number,
  promptLength: number,
): number {
  const price = priceFor(model);
  // Roughly four characters to a token, plus headroom for the system prompt and
  // whatever memory and upstream output were rendered into it.
  const inputTokens = Math.ceil(promptLength / 4) + 2_000;
  return round((inputTokens / 1_000_000) * price.input + (maxTokens / 1_000_000) * price.output);
}

/**
 * USD per million tokens, mirroring lib/integrations/ai/anthropic.ts.
 *
 * Kept here as well because the estimate has to be made *before* the provider
 * is called, and an unknown model falls back to the most expensive entry rather
 * than the cheapest — guessing low is how a ceiling gets passed.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.8, output: 4 },
};

function priceFor(model: string): { input: number; output: number } {
  const key = Object.keys(PRICING).find((name) => model.startsWith(name));
  return PRICING[key ?? 'claude-opus']!;
}
