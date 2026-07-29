import 'server-only';
import { logActivity, notify } from '@/lib/agents/activity';
import type { RunContext } from '@/lib/agents/context';
import type { PersistResult } from '@/lib/agents/capabilities';
import type { NotificationKind, YoutubeVideo } from '@/types/domain';

export {
  resolveScript,
  resolveSettings,
  resolveVideo,
  setStage,
} from '@/lib/production/resolve';

/**
 * Stops a production step with a stated reason.
 *
 * This is the honest-failure path: the video records why it is blocked, the
 * operator is notified, and the workflow halts rather than substituting
 * something that did not happen.
 */
export async function blockProduction(
  ctx: RunContext,
  video: YoutubeVideo | null,
  reason: string,
  options: { notifyKind?: NotificationKind } = {},
): Promise<PersistResult> {
  if (video) {
    await ctx.store.update('youtube_videos', video.id, {
      status: 'blocked',
      blocked_reason: reason,
      updated_at: new Date().toISOString(),
    });
  }
  await logActivity(ctx.store, {
    ownerId: ctx.ownerId,
    businessId: ctx.task.business_id,
    missionId: ctx.task.mission_id,
    taskId: ctx.task.id,
    agentId: ctx.agent.id,
    kind: 'blocked',
    message: `${ctx.agent.name} is blocked — ${reason}`,
  });
  await notify(ctx.store, {
    ownerId: ctx.ownerId,
    kind: options.notifyKind ?? 'mission_blocked',
    title: `${ctx.agent.name} is blocked`,
    body: reason,
    href: video ? `/youtube/production/${video.id}` : '/missions',
  });
  return {
    summary: `is blocked — ${reason}`,
    output: { blocked: true, reason, video_id: video?.id ?? null },
    blocked: reason,
  };
}

/** Raises a spend approval and parks the step until the operator decides. */
export async function requestSpendApproval(
  ctx: RunContext,
  video: YoutubeVideo | null,
  detail: {
    estimate: number;
    category: string;
    reason: string;
    resumeInput: Record<string, unknown>;
  },
): Promise<PersistResult> {
  return {
    summary: `needs approval to spend £${detail.estimate.toFixed(2)} on ${detail.category}`,
    output: {
      awaiting_spend_approval: true,
      estimate: detail.estimate,
      category: detail.category,
      video_id: video?.id ?? null,
      ...detail.resumeInput,
    },
    approval: {
      kind: 'spend',
      title: `Approve £${detail.estimate.toFixed(2)} for ${detail.category}`,
      summary: detail.reason,
      payload: {
        estimate: detail.estimate,
        category: detail.category,
        video_id: video?.id ?? null,
        task_id: ctx.task.id,
        // Approving re-runs the step with spending authorised for this task only.
        authorise_spend: true,
      },
    },
  };
}

/** True once the operator has approved spending for this specific task. */
export function spendAuthorised(ctx: RunContext): boolean {
  return ctx.task.input.spend_authorised === true;
}

