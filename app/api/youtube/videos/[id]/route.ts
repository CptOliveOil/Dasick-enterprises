import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { buildProductionSummary } from '@/lib/production/summary';
import { recordOperatorAction } from '@/lib/production/actions';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { store, ownerId } = await getStore();
  const summary = await buildProductionSummary(store, ownerId, id);
  if (!summary) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });
  return NextResponse.json(summary);
}

const patchSchema = z.object({
  title: z.string().min(3).max(160).optional(),
  /** Selecting a thumbnail is an operator decision; agents never make it. */
  thumbnail_asset_id: z.string().uuid().nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid video update.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const video = await store.get('youtube_videos', id);
  if (!video) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });

  if (parsed.data.thumbnail_asset_id) {
    const asset = await store.get('media_assets', parsed.data.thumbnail_asset_id);
    if (!asset || asset.owner_id !== ownerId || asset.type !== 'thumbnail') {
      return NextResponse.json({ error: 'That is not a thumbnail asset.' }, { status: 400 });
    }
    const concepts = await store.list('youtube_thumbnail_concepts', { where: { video_id: id } });
    for (const concept of concepts) {
      await store.update('youtube_thumbnail_concepts', concept.id, {
        selected: concept.asset_id === parsed.data.thumbnail_asset_id,
      });
    }
    await recordOperatorAction(store, {
      ownerId,
      businessId: video.business_id,
      missionId: video.mission_id,
      message: `Selected a thumbnail for "${video.title}"`,
    });
  }

  const updated = await store.update('youtube_videos', id, {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json(updated);
}
