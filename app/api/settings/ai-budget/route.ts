import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { getAiBudget, monthToDateSpend, setAiBudget } from '@/lib/finance/ai-budget';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * The account's AI spending ceiling.
 *
 * The only writer of `ai_budgets` anywhere in the application, and guarded by
 * `ai_budget.manage`, which the owner alone holds. Nothing an agent can invoke
 * reaches this route: agents run inside tasks through the capability registry,
 * which has no HTTP client and no session. That is what makes "an agent cannot
 * raise its own ceiling" structural rather than aspirational.
 */

const bodySchema = z
  .object({
    currency: z.string().trim().length(3).toUpperCase().default('GBP'),
    // No default. A ceiling the operator did not choose is not a ceiling, and
    // the schema refusing to invent one is where that starts.
    monthly_ceiling: z.number().min(1).max(10_000),
    warn_at_percent: z.number().int().min(1).max(100).default(80),
    per_mission_ceiling: z.number().min(0.01).max(10_000),
    approval_over: z.number().min(0.01).max(10_000),
    activate: z.boolean(),
  })
  .refine((value) => value.per_mission_ceiling <= value.monthly_ceiling, {
    message: 'The per-mission ceiling cannot be higher than the monthly ceiling.',
    path: ['per_mission_ceiling'],
  })
  .refine((value) => value.approval_over <= value.per_mission_ceiling, {
    message: 'The approval threshold cannot be higher than the per-mission ceiling.',
    path: ['approval_over'],
  });

export async function GET() {
  return withPermission('ai_budget.manage', async ({ store, ownerId }) => {
    const [budget, spentThisMonth] = await Promise.all([
      getAiBudget(store, ownerId),
      monthToDateSpend(store, ownerId),
    ]);
    return NextResponse.json({
      budget,
      spentThisMonth,
      currency: budget?.currency ?? config.currency,
      // Nothing paid runs until this is true.
      active: Boolean(budget?.activated_at),
    });
  });
}

export async function PUT(request: Request) {
  return withPermission('ai_budget.manage', async ({ store, ownerId, profile }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Those budget figures are not valid.',
          detail: parsed.error.issues[0]?.message,
        },
        { status: 400 },
      );
    }

    const budget = await setAiBudget(store, ownerId, profile.id, parsed.data);
    const spentThisMonth = await monthToDateSpend(store, ownerId);
    return NextResponse.json({
      budget,
      spentThisMonth,
      currency: budget.currency,
      active: Boolean(budget.activated_at),
    });
  });
}
