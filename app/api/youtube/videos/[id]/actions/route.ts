import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { recordOperatorAction, runCapabilityTask } from '@/lib/production/actions';
import { getYoutubeProvider } from '@/lib/integrations/platforms';
import { resolveSettings } from '@/lib/production/resolve';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ACTIONS = {
  regenerate_voiceover: {
    capability: 'youtube.voiceover.generate',
    title: 'Regenerate narration',
  },
  replan_visuals: { capability: 'youtube.visual_plan', title: 'Re-plan visuals' },
  source_assets: { capability: 'youtube.asset_generate', title: 'Source outstanding assets' },
  regenerate_thumbnails: {
    capability: 'youtube.thumbnail.concepts',
    title: 'Regenerate thumbnail concepts',
  },
  render_thumbnails: {
    capability: 'youtube.thumbnail.generate',
    title: 'Render thumbnail candidates',
  },
  rewrite_metadata: { capability: 'youtube.metadata', title: 'Rewrite metadata' },
  reassemble: { capability: 'youtube.video_assemble', title: 'Re-assemble video' },
  quality_check: { capability: 'youtube.quality_check', title: 'Re-run quality check' },
} as const;

const bodySchema = z.object({
  action: z.enum([
    ...(Object.keys(ACTIONS) as [keyof typeof ACTIONS]),
    'publish',
    'schedule',
    'unblock',
  ]),
  /** Extra instruction passed to the agent, e.g. "make the thumbnail bolder". */
  instructions: z.string().max(1000).optional(),
  publish_at: z.string().datetime().optional(),
});

/**
 * Production actions on one video.
 *
 * Everything that needs an agent runs through the shared engine. Publishing is
 * handled separately because it is an external action and stays gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const video = await store.get('youtube_videos', id);
  if (!video) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });

  const { action } = parsed.data;

  if (action === 'unblock') {
    const updated = await store.update('youtube_videos', id, {
      status: 'production',
      blocked_reason: null,
      updated_at: new Date().toISOString(),
    });
    await recordOperatorAction(store, {
      ownerId,
      businessId: video.business_id,
      missionId: video.mission_id,
      message: `Cleared the blocked state on "${video.title}"`,
    });
    return NextResponse.json({ video: updated });
  }

  if (action === 'publish' || action === 'schedule') {
    return handlePublish(store, ownerId, video, action, parsed.data.publish_at);
  }

  const spec = ACTIONS[action];
  const run = await runCapabilityTask(store, {
    ownerId,
    businessId: video.business_id,
    missionId: video.mission_id,
    capability: spec.capability,
    title: spec.title,
    description: parsed.data.instructions ?? '',
    input: {
      video_id: video.id,
      ...(parsed.data.instructions ? { operator_feedback: parsed.data.instructions } : {}),
    },
  });

  await recordOperatorAction(store, {
    ownerId,
    businessId: video.business_id,
    missionId: video.mission_id,
    message: `${spec.title} on "${video.title}"`,
  });

  return NextResponse.json({
    run: run.result,
    error: run.error,
    video: await store.get('youtube_videos', id),
  });
}

/**
 * Publishing.
 *
 * Requires final approval first, requires the operator to have explicitly
 * enabled auto-publish or to be acting themselves, and requires a genuinely
 * connected YouTube provider. Without one the video stays READY TO PUBLISH —
 * it is never reported as published.
 */
async function handlePublish(
  store: Awaited<ReturnType<typeof getStore>>['store'],
  ownerId: string,
  video: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['store']['get']>>> & {
    id: string;
    title: string;
    status: string;
    business_id: string;
    mission_id: string | null;
  },
  action: 'publish' | 'schedule',
  publishAt?: string,
) {
  if (video.status !== 'ready') {
    return NextResponse.json(
      {
        error:
          'This video has not passed final approval, so it cannot be published or scheduled.',
      },
      { status: 409 },
    );
  }

  const approvals = await store.list('approvals', { where: { owner_id: ownerId } });
  const approved = approvals.some(
    (a) => a.kind === 'video' && a.status === 'approved' && a.payload.video_id === video.id,
  );
  if (!approved) {
    return NextResponse.json(
      { error: 'Final approval has not been granted for this video.' },
      { status: 409 },
    );
  }

  const provider = getYoutubeProvider();
  if (!provider.connected) {
    await recordOperatorAction(store, {
      ownerId,
      businessId: video.business_id,
      missionId: video.mission_id,
      message: `Publish attempted for "${video.title}" but YouTube is not connected`,
    });
    return NextResponse.json(
      {
        error:
          'YouTube is not connected, so nothing can be uploaded. The video remains READY TO PUBLISH and can be downloaded from the production view.',
        ready_to_publish: true,
      },
      { status: 409 },
    );
  }

  const settings = await resolveSettings(store, ownerId, video.business_id);
  if (!settings.auto_publish_after_approval) {
    // Reaching here means a real adapter exists; the upload itself is the
    // adapter's job and is not simulated.
    return NextResponse.json(
      {
        error:
          'Auto-publish is disabled. Enable it in YouTube → Settings, or upload manually from the exported file.',
      },
      { status: 409 },
    );
  }

  if (action === 'schedule' && publishAt) {
    const updated = await store.update('youtube_videos', video.id, {
      status: 'scheduled',
      publish_at: publishAt,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ video: updated });
  }

  return NextResponse.json(
    {
      error:
        'A YouTube adapter is configured but upload is not yet implemented in this build. The video remains READY TO PUBLISH.',
      ready_to_publish: true,
    },
    { status: 501 },
  );
}
