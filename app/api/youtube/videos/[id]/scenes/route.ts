import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { recordOperatorAction, runCapabilityTask } from '@/lib/production/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  scene_id: z.string().uuid(),
  action: z.enum(['update', 'retry', 'replace_asset', 'approve']),
  patch: z
    .object({
      narration: z.string().max(4000).optional(),
      visual_direction: z.string().max(2000).optional(),
      image_prompt: z.string().max(2000).optional(),
      video_prompt: z.string().max(2000).optional(),
      b_roll_query: z.string().max(400).optional(),
      on_screen_text: z.string().max(200).optional(),
      transition: z.string().max(40).optional(),
      duration_seconds: z.number().min(1).max(120).optional(),
      asset_strategy: z
        .enum([
          'generated_image',
          'generated_video',
          'stock',
          'text_motion',
          'screen_recording',
          'archive_public_source',
          'existing_asset',
        ])
        .optional(),
    })
    .optional(),
  asset_id: z.string().uuid().optional(),
});

/** Scene-level operator control: edit, retry, replace or approve one scene. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid scene action.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const video = await store.get('youtube_videos', id);
  if (!video) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });

  const scene = await store.get('youtube_scenes', parsed.data.scene_id);
  if (!scene || scene.video_id !== id) {
    return NextResponse.json({ error: 'Scene not found on this video.' }, { status: 404 });
  }

  switch (parsed.data.action) {
    case 'update': {
      const updated = await store.update('youtube_scenes', scene.id, parsed.data.patch ?? {});
      await recordOperatorAction(store, {
        ownerId,
        businessId: video.business_id,
        missionId: video.mission_id,
        message: `Edited scene ${scene.scene_number} of "${video.title}"`,
      });
      return NextResponse.json({ scene: updated });
    }

    case 'approve': {
      const updated = await store.update('youtube_scenes', scene.id, { status: 'approved' });
      return NextResponse.json({ scene: updated });
    }

    case 'replace_asset': {
      if (!parsed.data.asset_id) {
        return NextResponse.json({ error: 'No replacement asset given.' }, { status: 400 });
      }
      const asset = await store.get('media_assets', parsed.data.asset_id);
      if (!asset || asset.owner_id !== ownerId || asset.status !== 'ready') {
        return NextResponse.json({ error: 'That asset is not usable.' }, { status: 400 });
      }
      const updated = await store.update('youtube_scenes', scene.id, {
        asset_id: asset.id,
        asset_status: 'ready',
        status: 'ready',
        error: null,
      });
      await recordOperatorAction(store, {
        ownerId,
        businessId: video.business_id,
        missionId: video.mission_id,
        message: `Replaced the asset on scene ${scene.scene_number} of "${video.title}"`,
      });
      return NextResponse.json({ scene: updated });
    }

    case 'retry': {
      // Clearing the asset is what makes the Asset Agent pick up this scene
      // and only this scene on its next run.
      await store.update('youtube_scenes', scene.id, {
        asset_id: null,
        asset_status: 'pending',
        status: 'awaiting_asset',
        error: null,
      });
      const run = await runCapabilityTask(store, {
        ownerId,
        businessId: video.business_id,
        missionId: video.mission_id,
        capability: 'youtube.asset_generate',
        title: `Re-source scene ${scene.scene_number}`,
        input: { video_id: video.id },
      });
      const refreshed = await store.get('youtube_scenes', scene.id);
      return NextResponse.json({ scene: refreshed, run: run.result, error: run.error });
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
