import 'server-only';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { logActivity, notify } from '@/lib/agents/activity';
import type { CapabilityHandler, PersistResult } from '@/lib/agents/capabilities';
import type { RunContext } from '@/lib/agents/context';
import { checkSpend } from '@/lib/finance/budgets';
import { getImageProvider } from '@/lib/integrations/providers/registry';
import { createMediaAsset, recordFailedAsset } from '@/lib/media/assets';
import { readOutput, runFfmpeg, withTempDir } from '@/lib/media/ffmpeg';
import { getMediaStorage } from '@/lib/media/storage';
import { zip } from '@/lib/approvals/export';
import { resolveProduct } from '@/lib/production/etsy-resolve';
import type { EtsyProduct } from '@/types/domain';
import type { MediaAsset } from '@/types/production';

/**
 * The Etsy artwork chain: concept → artwork → upscale → aspect-ratio
 * variants → mockups → packaging.
 *
 * Mirrors the YouTube production handlers in `./assets.ts` and `./studio.ts`
 * — same engine, same `media_assets` table, same honesty rules (a placeholder
 * is always marked `simulated`, a blocked step says why) — but scoped to
 * `product_id` rather than `video_id`, because an Etsy product has no video.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function blocked(reason: string, extra: Record<string, unknown> = {}): PersistResult {
  return {
    summary: `is blocked — ${reason}`,
    output: { blocked: true, reason, ...extra },
    blocked: reason,
  };
}

async function requestEtsySpendApproval(
  ctx: RunContext,
  product: EtsyProduct,
  estimate: number,
  category: string,
  reason: string,
): Promise<PersistResult> {
  return {
    summary: `needs approval to spend £${estimate.toFixed(2)} on ${category}`,
    output: {
      awaiting_spend_approval: true,
      estimate,
      category,
      product_id: product.id,
    },
    approval: {
      kind: 'spend',
      title: `Approve £${estimate.toFixed(2)} for ${category}`,
      summary: reason,
      payload: {
        estimate,
        category,
        product_id: product.id,
        task_id: ctx.task.id,
        authorise_spend: true,
      },
    },
  };
}

/** Runs an ffmpeg filter over one image and returns the result as bytes. */
async function filterImage(
  data: Buffer,
  extension: string,
  filter: string,
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = path.join(dir, `in.${extension}`);
    const output = path.join(dir, 'out.png');
    await writeFile(input, data);
    await runFfmpeg(['-i', input, '-vf', filter, '-frames:v', '1', output]);
    return readOutput(output);
  });
}

async function readAssetBytes(asset: MediaAsset): Promise<Buffer> {
  if (!asset.storage_path) throw new Error(`Asset ${asset.id} has no stored file.`);
  return getMediaStorage().read(asset.storage_path);
}

const ARTWORK_SIZE = 2048;
const UPSCALED_SIZE = ARTWORK_SIZE * 2;

/** Aspect-ratio variants Etsy listings actually use. */
const VARIANTS: { ratio: string; width: number; height: number }[] = [
  { ratio: '1:1', width: 3000, height: 3000 },
  { ratio: '4:5', width: 3000, height: 3750 },
  { ratio: '16:9', width: 3000, height: 1688 },
];

/* ------------------------------------------------------------------ */
/* Artwork                                                              */
/* ------------------------------------------------------------------ */

export const etsyArtworkGenerate: CapabilityHandler = {
  capability: 'etsy.artwork.generate',
  label: 'Generate artwork',
  mode: 'provider',
  schemaName: 'EtsyArtwork',
  schema: undefined as never,

  async run(ctx): Promise<PersistResult> {
    const product = await resolveProduct(ctx);
    if (!product) return blocked('No product exists to generate artwork for.');

    if (product.artwork_asset_id) {
      const existing = await ctx.store.get('media_assets', product.artwork_asset_id).catch(() => null);
      if (existing?.status === 'ready') {
        return {
          summary: 'artwork already exists — nothing regenerated',
          output: { product_id: product.id, artwork_asset_id: existing.id, generated: false },
        };
      }
    }

    if (!product.design_concept) {
      return blocked('No design concept has been produced yet, so there is nothing to draw.');
    }

    const provider = getImageProvider();
    if (!provider.isConnected()) {
      return blocked(
        `Artwork needs an image provider (${provider.descriptor.requiredEnv.join(', ')}).`,
      );
    }

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const estimate = provider.estimateCost(1);
    if (estimate > 0 && ctx.task.input.spend_authorised !== true) {
      const check = await checkSpend(ctx.store, ctx.ownerId, businessId, null, 'image', estimate);
      if (check.exceedsCeiling) return blocked(check.reason, { product_id: product.id });
      if (check.requiresApproval) {
        return requestEtsySpendApproval(
          ctx,
          product,
          estimate,
          'artwork',
          `Generating the artwork for "${product.name}" is estimated at £${estimate.toFixed(2)}. ${check.reason}`,
        );
      }
    }

    const produced = await provider.generateImage({
      prompt: product.design_concept.artwork_prompt,
      width: ARTWORK_SIZE,
      height: ARTWORK_SIZE,
      purpose: 'artwork',
    });

    const asset = await createMediaAsset(ctx.store, {
      ownerId: ctx.ownerId,
      businessId,
      missionId: ctx.task.mission_id,
      productId: product.id,
      taskId: ctx.task.id,
      type: 'image',
      provider: produced.providerAssetId ? getImageProvider().descriptor.name : provider.descriptor.name,
      providerAssetId: produced.providerAssetId ?? null,
      mimeType: produced.mimeType,
      extension: produced.extension,
      data: produced.data,
      width: produced.width ?? ARTWORK_SIZE,
      height: produced.height ?? ARTWORK_SIZE,
      generationPrompt: product.design_concept.artwork_prompt,
      generationCost: produced.cost,
      simulated: produced.simulated,
      metadata: { ...produced.metadata, purpose: 'artwork' },
    });

    await ctx.store.update('etsy_products', product.id, {
      artwork_asset_id: asset.id,
      estimated_cost: Number((product.estimated_cost + produced.cost).toFixed(4)),
      updated_at: new Date().toISOString(),
    });

    return {
      summary: `generated the artwork${produced.simulated ? ' (simulated)' : ''}`,
      output: { product_id: product.id, artwork_asset_id: asset.id, generated: true },
      spend: produced.cost > 0 ? { amount: produced.cost, provider: asset.provider, product: 'artwork' } : undefined,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Upscale                                                              */
/* ------------------------------------------------------------------ */

export const etsyArtworkUpscale: CapabilityHandler = {
  capability: 'etsy.artwork.upscale',
  label: 'Upscale artwork',
  mode: 'provider',
  schemaName: 'EtsyUpscale',
  schema: undefined as never,

  async run(ctx): Promise<PersistResult> {
    const product = await resolveProduct(ctx);
    if (!product) return blocked('No product exists to upscale artwork for.');
    if (product.upscaled_asset_id) {
      const existing = await ctx.store.get('media_assets', product.upscaled_asset_id).catch(() => null);
      if (existing?.status === 'ready') {
        return {
          summary: 'upscaled artwork already exists',
          output: { product_id: product.id, upscaled_asset_id: existing.id, generated: false },
        };
      }
    }
    if (!product.artwork_asset_id) return blocked('No artwork exists yet to upscale.');

    const source = await ctx.store.get('media_assets', product.artwork_asset_id).catch(() => null);
    if (!source || source.status !== 'ready') {
      return blocked('The artwork asset is not ready, so it cannot be upscaled.');
    }

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';

    try {
      const bytes = await readAssetBytes(source);
      const upscaled = await filterImage(
        bytes,
        source.storage_path!.split('.').pop() ?? 'png',
        // Lanczos resampling — real signal processing, not AI super-resolution.
        `scale=${UPSCALED_SIZE}:${UPSCALED_SIZE}:flags=lanczos`,
      );

      const asset = await createMediaAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        productId: product.id,
        taskId: ctx.task.id,
        type: 'image',
        provider: 'ffmpeg',
        mimeType: 'image/png',
        extension: 'png',
        data: upscaled,
        width: UPSCALED_SIZE,
        height: UPSCALED_SIZE,
        generationPrompt: source.generation_prompt,
        simulated: source.simulated,
        metadata: { purpose: 'upscaled', method: 'ffmpeg-lanczos', source_asset_id: source.id },
      });

      await ctx.store.update('etsy_products', product.id, {
        upscaled_asset_id: asset.id,
        updated_at: new Date().toISOString(),
      });

      return {
        summary: `upscaled the artwork to ${UPSCALED_SIZE}×${UPSCALED_SIZE}${source.simulated ? ' (simulated source)' : ''}`,
        output: { product_id: product.id, upscaled_asset_id: asset.id, generated: true },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Upscaling failed';
      await recordFailedAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        productId: product.id,
        taskId: ctx.task.id,
        type: 'image',
        provider: 'ffmpeg',
        mimeType: 'image/png',
        error: reason,
      });
      return blocked(`Could not upscale the artwork: ${reason}`);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Aspect ratio variants                                                */
/* ------------------------------------------------------------------ */

export const etsyArtworkVariants: CapabilityHandler = {
  capability: 'etsy.artwork.variants',
  label: 'Aspect ratio variants',
  mode: 'provider',
  schemaName: 'EtsyVariants',
  schema: undefined as never,

  async run(ctx): Promise<PersistResult> {
    const product = await resolveProduct(ctx);
    if (!product) return blocked('No product exists to crop variants for.');

    const sourceId = product.upscaled_asset_id ?? product.artwork_asset_id;
    if (!sourceId) return blocked('No artwork exists yet to crop into aspect ratios.');
    const source = await ctx.store.get('media_assets', sourceId).catch(() => null);
    if (!source || source.status !== 'ready') {
      return blocked('The source artwork is not ready, so no variants can be cropped.');
    }

    const remaining = VARIANTS.filter((v) => !product.variant_asset_ids[v.ratio]);
    if (remaining.length === 0) {
      return {
        summary: 'every aspect ratio variant already exists',
        output: { product_id: product.id, variant_asset_ids: product.variant_asset_ids, generated: 0 },
      };
    }

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const bytes = await readAssetBytes(source);
    const extension = source.storage_path!.split('.').pop() ?? 'png';
    const variantIds: Record<string, string> = { ...product.variant_asset_ids };

    for (const variant of remaining) {
      // Scale to cover the target box, then crop the centre — a standard
      // "cover" crop, not a stretch, so nothing in the artwork distorts.
      const filter =
        `scale=${variant.width}:${variant.height}:force_original_aspect_ratio=increase,` +
        `crop=${variant.width}:${variant.height}`;
      const cropped = await filterImage(bytes, extension, filter);
      const asset = await createMediaAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        productId: product.id,
        taskId: ctx.task.id,
        type: 'image',
        provider: 'ffmpeg',
        mimeType: 'image/png',
        extension: 'png',
        data: cropped,
        width: variant.width,
        height: variant.height,
        simulated: source.simulated,
        metadata: { purpose: 'variant', ratio: variant.ratio, method: 'ffmpeg-cover-crop', source_asset_id: source.id },
      });
      variantIds[variant.ratio] = asset.id;
    }

    await ctx.store.update('etsy_products', product.id, {
      variant_asset_ids: variantIds,
      updated_at: new Date().toISOString(),
    });

    return {
      summary: `cropped ${remaining.length} aspect ratio ${remaining.length === 1 ? 'variant' : 'variants'} (${remaining.map((v) => v.ratio).join(', ')})`,
      output: { product_id: product.id, variant_asset_ids: variantIds, generated: remaining.length },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Mockups                                                              */
/* ------------------------------------------------------------------ */

interface MockupSpec {
  name: string;
  width: number;
  height: number;
  colour: string;
}

const MOCKUPS: MockupSpec[] = [
  { name: 'Bordered print preview', width: 3400, height: 3400, colour: 'white' },
  { name: 'Framed context preview', width: 4200, height: 4200, colour: '#d9d2c5' },
];

export const etsyMockupsGenerate: CapabilityHandler = {
  capability: 'etsy.mockups.generate',
  label: 'Generate mockups',
  mode: 'provider',
  schemaName: 'EtsyMockups',
  schema: undefined as never,

  async run(ctx): Promise<PersistResult> {
    const product = await resolveProduct(ctx);
    if (!product) return blocked('No product exists to build mockups for.');

    const sourceId = product.upscaled_asset_id ?? product.artwork_asset_id;
    if (!sourceId) return blocked('No artwork exists yet to place into a mockup.');
    const source = await ctx.store.get('media_assets', sourceId).catch(() => null);
    if (!source || source.status !== 'ready') {
      return blocked('The source artwork is not ready, so no mockups can be composited.');
    }

    if (product.mockup_asset_ids.length >= MOCKUPS.length) {
      return {
        summary: 'mockups already exist',
        output: { product_id: product.id, mockup_asset_ids: product.mockup_asset_ids, generated: 0 },
      };
    }

    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const bytes = await readAssetBytes(source);
    const extension = source.storage_path!.split('.').pop() ?? 'png';
    const mockupIds: string[] = [...product.mockup_asset_ids];

    for (const mockup of MOCKUPS) {
      // A real local composite, not a photograph: the artwork is centred on
      // a plain matte canvas, sized down so the border reads as a margin.
      // Honest about what it is — see the metadata note.
      const inset = Math.round(mockup.width * 0.78);
      const filter =
        `scale=${inset}:${inset}:flags=lanczos,` +
        `pad=${mockup.width}:${mockup.height}:(ow-iw)/2:(oh-ih)/2:color=${mockup.colour}`;
      const composited = await filterImage(bytes, extension, filter);
      const asset = await createMediaAsset(ctx.store, {
        ownerId: ctx.ownerId,
        businessId,
        missionId: ctx.task.mission_id,
        productId: product.id,
        taskId: ctx.task.id,
        type: 'image',
        provider: 'ffmpeg',
        mimeType: 'image/png',
        extension: 'png',
        data: composited,
        width: mockup.width,
        height: mockup.height,
        simulated: source.simulated,
        metadata: {
          purpose: 'mockup',
          label: mockup.name,
          method: 'ffmpeg-composite',
          note: 'A locally composited preview, not a photographed physical mockup.',
          source_asset_id: source.id,
        },
      });
      mockupIds.push(asset.id);
    }

    await ctx.store.update('etsy_products', product.id, {
      mockup_asset_ids: mockupIds,
      updated_at: new Date().toISOString(),
    });

    return {
      summary: `composited ${MOCKUPS.length} mockup previews`,
      output: { product_id: product.id, mockup_asset_ids: mockupIds, generated: MOCKUPS.length },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Packaging                                                            */
/* ------------------------------------------------------------------ */

export const etsyPackageZip: CapabilityHandler = {
  capability: 'etsy.package.zip',
  label: 'Package for delivery',
  mode: 'provider',
  schemaName: 'EtsyPackage',
  schema: undefined as never,

  async run(ctx): Promise<PersistResult> {
    const product = await resolveProduct(ctx);
    if (!product) return blocked('No product exists to package.');

    const listings = await ctx.store
      .list('etsy_listings', { where: { product_id: product.id } })
      .catch(() => []);
    const listing = [...listings].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    if (!listing) return blocked('No listing has been drafted yet, so there is nothing to package.');

    const assetIds = [
      product.upscaled_asset_id ?? product.artwork_asset_id,
      ...Object.values(product.variant_asset_ids),
      ...product.mockup_asset_ids,
    ].filter((id): id is string => Boolean(id));

    if (assetIds.length === 0) {
      return blocked('No artwork exists yet, so there is nothing to package.');
    }

    const assets = (
      await Promise.all(assetIds.map((id) => ctx.store.get('media_assets', id).catch(() => null)))
    ).filter((a): a is MediaAsset => Boolean(a) && a!.status === 'ready');

    const entries: { name: string; content: string | Uint8Array }[] = [
      { name: 'listing.md', content: listingMarkdown(product, listing) },
    ];
    for (const asset of assets) {
      const purpose = String((asset.metadata as Record<string, unknown>)?.purpose ?? asset.type);
      const ratio = (asset.metadata as Record<string, unknown>)?.ratio;
      const suffix = ratio ? `-${String(ratio).replace(':', 'x')}` : '';
      entries.push({
        name: `${purpose}${suffix}-${asset.id.slice(0, 8)}.png`,
        content: await readAssetBytes(asset),
      });
    }

    const archive = zip(entries);
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const asset = await createMediaAsset(ctx.store, {
      ownerId: ctx.ownerId,
      businessId,
      missionId: ctx.task.mission_id,
      productId: product.id,
      taskId: ctx.task.id,
      type: 'archive',
      provider: 'local-zip',
      mimeType: 'application/zip',
      extension: 'zip',
      data: Buffer.from(archive),
      metadata: { purpose: 'package', file_count: entries.length },
    });

    await ctx.store.update('etsy_products', product.id, {
      package_asset_id: asset.id,
      status: 'ready',
      updated_at: new Date().toISOString(),
    });

    await logActivity(ctx.store, {
      ownerId: ctx.ownerId,
      businessId: product.business_id,
      missionId: ctx.task.mission_id,
      taskId: ctx.task.id,
      agentId: ctx.agent.id,
      kind: 'asset_created',
      message: `Packaged "${product.name}" — ${entries.length} files`,
      metadata: { asset_id: asset.id, product_id: product.id },
    });
    await notify(ctx.store, {
      ownerId: ctx.ownerId,
      kind: 'mission_completed',
      title: `"${product.name}" is packaged`,
      body: `${entries.length} files, ready to download from the product page.`,
      href: `/etsy/products`,
    });

    return {
      summary: `packaged "${product.name}" for delivery (${entries.length} files)`,
      output: { product_id: product.id, package_asset_id: asset.id, file_count: entries.length },
    };
  },
};

function listingMarkdown(
  product: EtsyProduct,
  listing: { title: string; description: string; tags: string[]; price_suggestion: number },
): string {
  return [
    `# ${listing.title}`,
    '',
    `Price: £${listing.price_suggestion.toFixed(2)}`,
    `Category: ${product.category}`,
    '',
    listing.description,
    '',
    '## Tags',
    '',
    listing.tags.map((tag) => `- ${tag}`).join('\n'),
    '',
  ].join('\n');
}

export const ETSY_PRODUCTION_HANDLERS: CapabilityHandler<never>[] = [
  etsyArtworkGenerate,
  etsyArtworkUpscale,
  etsyArtworkVariants,
  etsyMockupsGenerate,
  etsyPackageZip,
] as unknown as CapabilityHandler<never>[];
