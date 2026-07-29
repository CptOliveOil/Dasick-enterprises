import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { logActivity, notify } from '@/lib/agents/activity';
import type { Approval, ApprovalStatus } from '@/types/domain';
import { recomputeMission, releaseUnblockedTasks } from './engine';

export type ApprovalDecision = 'approve' | 'reject' | 'request_changes';

export interface ResolveApprovalResult {
  approval: Approval;
  /** True when the mission can now continue running. */
  shouldContinue: boolean;
  missionId: string | null;
}

const DECISION_STATUS: Record<ApprovalDecision, ApprovalStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'changes_requested',
};

/**
 * Resolves an approval and applies the consequences to the task, the mission
 * and whatever domain object was being approved.
 *
 * "Request changes" deliberately re-queues the *same* task with the operator's
 * feedback attached, so existing dependencies stay intact and the agent gets
 * another attempt rather than the mission dying.
 */
export async function resolveApproval(
  store: DataStore,
  ownerId: string,
  approvalId: string,
  decision: ApprovalDecision,
  feedback?: string,
): Promise<ResolveApprovalResult> {
  const existing = await store.get('approvals', approvalId);
  if (!existing) throw new Error(`No approval with id ${approvalId}`);
  if (existing.status !== 'pending') {
    throw new Error('That approval has already been resolved.');
  }

  const timestamp = new Date().toISOString();
  const approval = await store.update('approvals', approvalId, {
    status: DECISION_STATUS[decision],
    feedback: feedback ?? null,
    resolved_at: timestamp,
  });

  const agent = approval.agent_id ? await store.get('agents', approval.agent_id) : null;

  if (approval.task_id) {
    const task = await store.get('tasks', approval.task_id);
    if (task) {
      // A spend gate is not "work to sign off" — it is permission to proceed.
      // Approving it re-queues the same step with spending authorised for that
      // task alone, so the agent does the work it was stopped before doing.
      const isSpendGate = approval.kind === 'spend' && approval.payload.authorise_spend === true;

      if (decision === 'approve' && isSpendGate) {
        await store.update('tasks', task.id, {
          status: 'queued',
          progress: 0,
          output: null,
          error: null,
          started_at: null,
          completed_at: null,
          input: { ...task.input, spend_authorised: true },
        });
      } else if (decision === 'approve') {
        await store.update('tasks', task.id, {
          status: 'completed',
          completed_at: timestamp,
          error: null,
        });
      } else if (decision === 'reject') {
        await store.update('tasks', task.id, {
          status: 'cancelled',
          error: feedback ?? 'Rejected by the operator.',
        });
      } else {
        await store.update('tasks', task.id, {
          status: 'queued',
          progress: 0,
          output: null,
          error: null,
          started_at: null,
          completed_at: null,
          input: { ...task.input, operator_feedback: feedback ?? '' },
        });
      }
    }
  }

  // The agent is no longer blocked on this operator decision either way.
  if (agent) {
    await store.update('agents', agent.id, { status: 'idle', updated_at: timestamp });
  }

  await applyDomainEffects(store, approval, decision);

  await logActivity(store, {
    ownerId,
    businessId: approval.business_id,
    missionId: approval.mission_id,
    taskId: approval.task_id,
    agentId: approval.agent_id,
    kind: 'approval_resolved',
    message:
      decision === 'approve'
        ? `Approved — ${approval.title}`
        : decision === 'reject'
          ? `Rejected — ${approval.title}`
          : `Changes requested — ${approval.title}`,
    metadata: { feedback: feedback ?? null },
  });

  if (approval.mission_id) {
    await releaseUnblockedTasks(store, approval.mission_id);
    const mission = await recomputeMission(store, approval.mission_id);
    if (mission?.status === 'completed') {
      await notify(store, {
        ownerId,
        kind: 'mission_completed',
        title: `Mission #${String(mission.number).padStart(3, '0')} completed`,
        body: mission.title,
        href: `/missions/${mission.id}`,
      });
    }
  }

  return {
    approval,
    shouldContinue: decision !== 'reject',
    missionId: approval.mission_id,
  };
}

/**
 * Approval kinds map onto real records. Approving a script marks the script
 * approved; rejecting a listing leaves it a draft and never publishes it.
 */
async function applyDomainEffects(
  store: DataStore,
  approval: Approval,
  decision: ApprovalDecision,
) {
  const timestamp = new Date().toISOString();
  const approved = decision === 'approve';

  switch (approval.kind) {
    case 'idea': {
      const ideaId = approval.payload.idea_id;
      if (typeof ideaId === 'string') {
        await store.update('youtube_ideas', ideaId, {
          status: approved ? 'approved' : decision === 'reject' ? 'rejected' : 'proposed',
        });
      }
      break;
    }
    case 'script': {
      const scriptId =
        typeof approval.payload.script_id === 'string' ? approval.payload.script_id : null;
      if (scriptId) {
        await store.update('youtube_scripts', scriptId, {
          status: approved ? 'approved' : decision === 'reject' ? 'rejected' : 'draft',
          updated_at: timestamp,
        });
        // Production may only begin once the script is approved.
        const videos = await store.list('youtube_videos', { where: { script_id: scriptId } });
        for (const video of videos) {
          await store.update('youtube_videos', video.id, {
            stage: approved ? 'voiceover' : 'script',
            status: approved ? 'production' : 'script',
            blocked_reason: null,
            updated_at: timestamp,
          });
        }
      }
      break;
    }
    case 'listing': {
      const listingId = approval.payload.listing_id;
      if (typeof listingId === 'string') {
        const listing = await store.update('etsy_listings', listingId, {
          status: approved ? 'approved' : 'draft',
        });
        if (listing.product_id) {
          await store.update('etsy_products', listing.product_id, {
            // Approval makes it ready — publishing is a separate, gated action.
            status: approved ? 'ready' : 'creating',
            updated_at: timestamp,
          });
        }
      }
      break;
    }
    case 'video': {
      const videoId = approval.payload.video_id;
      if (typeof videoId === 'string') {
        // Approved means ready to publish — not published. Publishing is a
        // separate, authority-gated action.
        await store.update('youtube_videos', videoId, {
          status: approved ? 'ready' : 'production',
          stage: approved ? 'publish' : 'quality_check',
          blocked_reason: null,
          updated_at: timestamp,
        });
      }
      break;
    }
    case 'thumbnail': {
      const assetId = approval.payload.selected_asset_id;
      const videoId = approval.payload.video_id;
      if (approved && typeof videoId === 'string' && typeof assetId === 'string') {
        await store.update('youtube_videos', videoId, {
          thumbnail_asset_id: assetId,
          updated_at: timestamp,
        });
      }
      break;
    }
    default:
      break;
  }
}
