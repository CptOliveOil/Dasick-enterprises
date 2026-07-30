import type { UUID } from './domain';

/**
 * The account-level ceiling on AI spending.
 *
 * Separate from `ProductionBudget`, which caps what one *video* may cost in
 * media providers. This caps what the whole workforce may spend on model calls
 * in a calendar month, and it is the control that stands between an operator
 * and a surprise invoice.
 *
 * Three properties are load-bearing:
 *
 * `activated_at` is null until the owner has chosen a ceiling. Until then no
 * paid model call runs at all. There is deliberately no default figure — a
 * number the operator did not choose is not a budget, it is a guess made on
 * their behalf with their money.
 *
 * `updated_by` records who last changed it, and the only route that writes this
 * table requires the owner role. No agent and no capability handler can reach
 * it, which is what makes "an agent cannot raise its own ceiling" a property of
 * the system rather than a promise.
 *
 * Every amount is in `currency`, the account's own.
 */
export interface AiBudget {
  id: UUID;
  owner_id: UUID;
  currency: string;

  /** Hard stop. Month-to-date spend at or above this runs nothing further. */
  monthly_ceiling: number;
  /** Percentage of the ceiling at which the operator starts being warned. */
  warn_at_percent: number;
  /** Most one mission may spend before it stops for the operator. */
  per_mission_ceiling: number;
  /** A single step estimated at or above this needs explicit approval first. */
  approval_over: number;

  /** Null until the owner has deliberately turned paid execution on. */
  activated_at: string | null;
  /** The profile that last changed any of the above. Always a person. */
  updated_by: UUID | null;

  created_at: string;
  updated_at: string;
}

/** What a spend decision concluded, and why, in the operator's own words. */
export interface AiSpendDecision {
  /** True when the call may go ahead now. */
  allowed: boolean;
  /** True when the operator must approve this specific step first. */
  requiresApproval: boolean;
  /** True when a ceiling would be broken — approval cannot override it. */
  exceedsCeiling: boolean;
  /** True when nothing may run because no budget has been set at all. */
  notActivated: boolean;
  reason: string;
  budget: AiBudget | null;
  /** Spend already recorded this calendar month. */
  spentThisMonth: number;
  /** Spend already recorded against this mission. */
  spentThisMission: number;
  /** What the ceiling leaves. Null when there is no budget to measure against. */
  remaining: number | null;
  /** True once month-to-date spend has passed the warning threshold. */
  warning: boolean;
}
