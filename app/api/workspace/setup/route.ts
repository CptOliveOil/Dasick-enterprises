import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { provisionWorkspace } from '@/lib/workspace/provision';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  include: z
    .array(z.enum(['youtube', 'etsy', 'islamic']))
    .min(1)
    .default(['youtube', 'etsy', 'islamic']),
  currency: z.string().trim().length(3).toUpperCase().default('GBP'),
});

/**
 * Sets up a brand-new real workspace with its workforce.
 *
 * Creates the channels and the agents, and nothing else — no missions, no
 * activity, no revenue, no costs, no analytics. A real workspace starts with a
 * workforce and an empty history, which is the only honest starting state.
 *
 * Idempotent: a workspace that already has agents is left exactly as it is.
 */
export async function POST(request: Request) {
  return withPermission('settings.manage', async ({ store, ownerId }) => {
    const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Those setup options are not valid.' },
        { status: 400 },
      );
    }

    // Everything below is wrapped, because the one thing this route must never
    // do is fail without a JSON body. An unhandled throw here becomes an HTML
    // error page, the browser's `response.json()` dies on it, and the operator
    // is shown "Unexpected end of JSON input" — which tells them nothing about
    // what actually went wrong. A database refusal is a real, explainable
    // outcome and deserves to be reported as one.
    try {
      const result = await provisionWorkspace(store, ownerId, parsed.data);

      if (result.alreadyProvisioned) {
        return NextResponse.json({
          ...result,
          message: 'This workspace already has agents, so nothing was created.',
        });
      }

      await logActivity(store, {
        ownerId,
        businessId: null,
        missionId: null,
        taskId: null,
        agentId: null,
        kind: 'system',
        message: `Workspace set up — ${result.agents} agents across ${result.businesses} businesses. No demo data was copied.`,
        metadata: { ...result },
      });

      return NextResponse.json({
        ...result,
        message: `Created ${result.agents} agents across ${result.businesses} businesses. History starts empty.`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Row Level Security refusing a write is the failure worth naming
      // precisely: it is a policy decision, not an outage, and the operator
      // needs to know it is not something they misconfigured.
      const isPolicy = /row-level security|violates row-level/i.test(detail);
      return NextResponse.json(
        {
          error: isPolicy
            ? 'The database refused part of the setup under its security policy. Nothing was changed. Please report this — it is a bug in Command Centre, not in your configuration.'
            : 'Setting up the workspace failed. Nothing partial has been left behind that a second attempt cannot finish.',
          detail,
        },
        { status: isPolicy ? 403 : 500 },
      );
    }
  });
}
