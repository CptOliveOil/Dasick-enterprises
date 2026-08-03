import 'server-only';
import type { RunContext } from '@/lib/agents/context';
import type { EtsyOpportunity, EtsyProduct } from '@/types/domain';

/**
 * Shared Etsy resolvers, on the same footing as `lib/production/resolve.ts`
 * for YouTube: the record a step is working on is found from the canonical
 * table, never carried forward as a snapshot in task input alone.
 */

export async function resolveOpportunity(ctx: RunContext): Promise<EtsyOpportunity | null> {
  const direct = ctx.task.input.opportunity_id;
  if (typeof direct === 'string') {
    const found = await ctx.store.get('etsy_opportunities', direct);
    if (found) return found;
  }
  const fromStep = ctx.previousOutputs.research?.opportunity_ids;
  if (Array.isArray(fromStep) && typeof fromStep[0] === 'string') {
    const found = await ctx.store.get('etsy_opportunities', fromStep[0]);
    if (found) return found;
  }
  return null;
}

/**
 * Finds the product record this build is working on.
 *
 * `create_product` is always the first step of the build workflow, so every
 * step after it can rely on the product existing — this just has to survive
 * a retry, where `previousOutputs` is rebuilt from completed task output
 * rather than carried in memory.
 */
export async function resolveProduct(ctx: RunContext): Promise<EtsyProduct | null> {
  const direct = ctx.task.input.product_id;
  if (typeof direct === 'string') {
    const found = await ctx.store.get('etsy_products', direct);
    if (found) return found;
  }
  const fromStep = ctx.previousOutputs.create_product?.product_id;
  if (typeof fromStep === 'string') {
    const found = await ctx.store.get('etsy_products', fromStep);
    if (found) return found;
  }
  // Last resort: the product created from this mission's opportunity, for a
  // retry where `create_product`'s own output was lost. Mirrors
  // `resolveVideo`'s fallback for the same failure mode.
  const opportunity = await resolveOpportunity(ctx);
  if (opportunity) {
    const products = await ctx.store.list('etsy_products', {
      where: { opportunity_id: opportunity.id },
    });
    if (products[0]) return products[0];
  }
  return null;
}
