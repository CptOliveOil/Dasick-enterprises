import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { resolveApproval } from '@/lib/workflows/approvals';
import { makeEtsyWorkspace, OWNER_ID } from './helpers';

/**
 * The Etsy build pipeline, end to end in Demo Mode: an approved opportunity
 * through product framing, design concept, artwork, upscaling, aspect-ratio
 * variants, mockups, keywords and a drafted listing, to a packaged zip.
 *
 * Everything the codebase demands of a real production run applies here too:
 * no key, no spend (Demo Mode's simulated image provider), every generated
 * asset flagged, and a real file behind every claim — no fabricated data.
 */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
  vi.stubEnv('IMAGE_PROVIDER', '');
  vi.stubEnv('IMAGE_PROVIDER_API_KEY', '');
});

describe('the Etsy build pipeline', () => {
  it('turns an approved opportunity into a fully packaged product', async () => {
    const { store, business } = await makeEtsyWorkspace();

    // --- Research -----------------------------------------------------
    const research = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find opportunities',
      objective: 'Find digital product opportunities',
      workflowKey: 'etsy_product',
    });
    await runMission(store, OWNER_ID, research.mission.id, { maxSteps: 5 });

    const opportunities = await store.list('etsy_opportunities', {
      where: { mission_id: research.mission.id },
    });
    expect(opportunities.length).toBeGreaterThan(0);
    const opportunity = opportunities[0]!;

    // --- Build, seeded from the approved opportunity -------------------
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: `Build: ${opportunity.product}`,
      objective: 'Build the complete product',
      workflowKey: 'etsy_product_build',
      context: { opportunity_id: opportunity.id },
      seedInput: { opportunity_id: opportunity.id },
    });
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    for (const task of tasks) {
      await store.update('tasks', task.id, { input: { ...task.input, opportunity_id: opportunity.id } });
    }

    const run = await runMission(store, OWNER_ID, mission.id, { maxSteps: 15 });
    expect(run.haltedBecause).toContain('approval');

    // --- Everything up to the listing gate must be real and complete ---
    const products = await store.list('etsy_products', { where: { opportunity_id: opportunity.id } });
    expect(products).toHaveLength(1);
    const product = products[0]!;

    expect(product.design_concept).toBeTruthy();
    expect(product.design_concept!.artwork_prompt.length).toBeGreaterThan(10);
    expect(product.artwork_asset_id).toBeTruthy();
    expect(product.upscaled_asset_id).toBeTruthy();
    expect(Object.keys(product.variant_asset_ids).sort()).toEqual(['16:9', '1:1', '4:5']);
    expect(product.mockup_asset_ids).toHaveLength(2);

    const imageAssets = await store.list('media_assets', { where: { product_id: product.id } });
    expect(imageAssets.length).toBeGreaterThanOrEqual(1 + 1 + 3 + 2); // artwork, upscale, 3 variants, 2 mockups
    for (const asset of imageAssets) {
      expect(asset.status).toBe('ready');
      expect(asset.file_size).toBeGreaterThan(0);
      // Demo Mode: nothing here came from a real, billable provider.
      expect(asset.simulated).toBe(true);
      expect(asset.generation_cost).toBe(0);
    }

    const upscaled = imageAssets.find((a) => a.id === product.upscaled_asset_id)!;
    expect(upscaled.width).toBe(4096);
    expect(upscaled.height).toBe(4096);

    const variant = imageAssets.find((a) => a.id === product.variant_asset_ids['4:5'])!;
    expect(variant.width).toBe(3000);
    expect(variant.height).toBe(3750);

    // --- The listing itself --------------------------------------------
    const approvals = await store.list('approvals', { where: { status: 'pending' } });
    const listingApproval = approvals.find((a) => a.kind === 'listing');
    expect(listingApproval).toBeTruthy();

    const listings = await store.list('etsy_listings', { where: { product_id: product.id } });
    expect(listings).toHaveLength(1);
    expect(listings[0]!.tags.length).toBeGreaterThan(0);

    // Nothing may package before the operator approves the listing.
    expect(product.package_asset_id).toBeNull();

    // --- Approve, and the package must follow ---------------------------
    await resolveApproval(store, OWNER_ID, listingApproval!.id, 'approve');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 5 });

    const finished = (await store.get('etsy_products', product.id))!;
    expect(finished.status).toBe('ready');
    expect(finished.package_asset_id).toBeTruthy();

    const archive = await store.get('media_assets', finished.package_asset_id!);
    expect(archive).toBeTruthy();
    expect(archive!.type).toBe('archive');
    expect(archive!.mime_type).toBe('application/zip');
    expect(archive!.file_size).toBeGreaterThan(0);
  }, 30_000);

  it('never packages before the listing is approved', async () => {
    const { store, business } = await makeEtsyWorkspace();
    const research = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Find opportunities',
      objective: 'Find digital product opportunities',
      workflowKey: 'etsy_product',
    });
    await runMission(store, OWNER_ID, research.mission.id, { maxSteps: 5 });
    const opportunity = (
      await store.list('etsy_opportunities', { where: { mission_id: research.mission.id } })
    )[0]!;

    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: `Build: ${opportunity.product}`,
      objective: 'Build the complete product',
      workflowKey: 'etsy_product_build',
      seedInput: { opportunity_id: opportunity.id },
    });
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    for (const task of tasks) {
      await store.update('tasks', task.id, { input: { ...task.input, opportunity_id: opportunity.id } });
    }
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 15 });

    const packageTask = (await store.list('tasks', { where: { mission_id: mission.id } })).find(
      (t) => t.step_key === 'package',
    )!;
    expect(['waiting', 'queued']).toContain(packageTask.status);

    const products = await store.list('etsy_products', { where: { opportunity_id: opportunity.id } });
    expect(products[0]!.package_asset_id).toBeNull();
  }, 30_000);
});
