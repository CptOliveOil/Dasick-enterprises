import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import { logActivity, notify } from '@/lib/agents/activity';
import type { Approval, ApprovalStatus } from '@/types/domain';
import { recomputeMission, releaseUnblockedTasks } from './engine';
import { scheduleRework } from '@/lib/approvals/rework';
import { resolveMissionScript } from './script-resolution';
import { recordMissionOutcome } from '@/lib/memory/business';

export type ApprovalDecision = 'approve' | 'reject' | 'request_changes';

/**
 * A rule said no.
 *
 * Distinct from a crash so callers can answer 409 rather than 500: the request
 * was well-formed and the server is fine — the workspace is simply not in a
 * state where that decision is allowed yet, and the message says why.
 */
export class ApprovalRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalRefused';
  }
}

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
 * "Request changes" never kills the mission. Where a rework capability exists
 * for the kind, the notes go to the agent that can actually redo the work and
 * the step that raised the approval waits behind it; otherwise the same step is
 * re-queued with the feedback attached, which is what it has always done.
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

  if (decision === 'approve') {
    const blocked = await sourcePolicyBlock(store, ownerId, existing);
    if (blocked) throw new ApprovalRefused(blocked);

    const unsettled = await unresolvedClaims(store, existing);
    if (unsettled) throw new ApprovalRefused(unsettled);
  }

  const timestamp = new Date().toISOString();
  const approval = await store.update('approvals', approvalId, {
    status: DECISION_STATUS[decision],
    feedback: feedback ?? null,
    resolved_at: timestamp,
  });

  const agent = approval.agent_id ? await store.get('agents', approval.agent_id) : null;

  // Changes requested: send the work back to whoever can actually redo it.
  // When a rework is scheduled it also puts the approval's own step behind it,
  // so the block below must not then re-queue that step.
  const rework =
    decision === 'request_changes'
      ? await scheduleRework(store, ownerId, approval, feedback ?? '')
      : null;

  if (approval.task_id && !rework) {
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
      // Business Intelligence Memory: the mission has finished, so what it was
      // and what it cost become part of what this business knows.
      await recordMissionOutcome(store, mission).catch(() => null);
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
 * Refuses a script approval that the channel's source policy does not allow.
 *
 * When a channel has asked for a source check before script approval, that has
 * to be enforced at the point of approval rather than merely hoped for in the
 * workflow: an operator can approve from the approvals list, from the galaxy or
 * from the API, and a workflow ordering does not survive a re-run or a manually
 * created mission. Returns the reason, or null when the approval may proceed.
 */
async function sourcePolicyBlock(
  store: DataStore,
  ownerId: string,
  approval: Approval,
): Promise<string | null> {
  if (approval.kind !== 'script') return null;
  const scriptId =
    typeof approval.payload.script_id === 'string' ? approval.payload.script_id : null;
  if (!scriptId || !approval.business_id) return null;

  const { usesIslamicWorkforce, getSourcePolicy } = await import('@/lib/islamic/resolve');
  if (!(await usesIslamicWorkforce(store, ownerId, approval.business_id))) return null;

  const policy = await getSourcePolicy(store, ownerId, approval.business_id);
  if (!policy.require_source_check_before_script_approval) return null;

  const checks = await store.list('islamic_source_checks', { where: { script_id: scriptId } });
  if (checks.length === 0) {
    return 'This channel requires an Islamic source check before a script can be approved, and none has been run for this script. Run the Islamic Source Checker first, or turn the requirement off in Source Policy.';
  }
  const latest = checks.reduce((newest, check) =>
    check.created_at > newest.created_at ? check : newest,
  );
  if (latest.verdict === 'blocked') {
    return `The Islamic Source Checker blocked this script: ${latest.summary} Resolve the flagged sources and re-run the check before approving.`;
  }
  return null;
}

/**
 * Refuses to close a source gate while claims are still unsourced.
 *
 * The gate exists to make each claim a decision. Approving the gate wholesale
 * while claims sit unresolved would turn it into exactly the click-through it
 * was designed to avoid — so every claim must be settled first, and "override"
 * is one of the ways to settle one.
 */
async function unresolvedClaims(
  store: DataStore,
  approval: Approval,
): Promise<string | null> {
  if (approval.kind !== 'source') return null;
  const resolutionId =
    typeof approval.payload.resolution_id === 'string' ? approval.payload.resolution_id : null;
  if (!resolutionId) return null;

  const record = await store.get('source_resolutions', resolutionId).catch(() => null);
  if (!record) return null;

  const outstanding = record.items.filter((item) => item.status === 'unresolved');
  if (outstanding.length === 0) return null;

  return `${outstanding.length} claim${outstanding.length === 1 ? '' : 's'} still ${outstanding.length === 1 ? 'has' : 'have'} no source. Settle each one — add a reference, ask the Source Checker to research it, edit or remove the claim, or override it deliberately — before closing this.`;
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
      // Resolved rather than read straight off the payload, so a lost head row
      // is rebuilt from the archive instead of taking the decision down with
      // it. This used to be an unguarded update: a missing script meant the
      // operator could not record an approval at all, which turned one bad row
      // into a stuck mission.
      const resolved = await resolveMissionScript(store, {
        taskInput: { script_id: approval.payload.script_id },
        previousOutputs: {},
        missionId: approval.mission_id,
        businessId: approval.business_id,
      }).catch(() => null);

      if (resolved) {
        await store.update('youtube_scripts', resolved.script.id, {
          status: approved ? 'approved' : decision === 'reject' ? 'rejected' : 'draft',
          updated_at: timestamp,
        });
        // Production may only begin once the script is approved.
        const videos = await store.list('youtube_videos', {
          where: { script_id: resolved.script.id },
        });
        for (const video of videos) {
          await store.update('youtube_videos', video.id, {
            stage: approved ? 'voiceover' : 'script',
            status: approved ? 'production' : 'script',
            blocked_reason: null,
            updated_at: timestamp,
          });
        }
      }
      // No else. The operator's decision is already recorded on the approval
      // itself; failing here would discard a decision they have made because of
      // a record they cannot see.
      break;
    }
    case 'source': {
      // Approving the gate marks it settled. It cannot be reached with anything
      // still unresolved — `unresolvedClaims` refuses earlier — so this only
      // records the close. Rejecting leaves the record open, because the claims
      // are still unsourced whatever the operator decided about the gate.
      const resolutionId =
        typeof approval.payload.resolution_id === 'string'
          ? approval.payload.resolution_id
          : null;
      if (resolutionId && approved) {
        await store.update('source_resolutions', resolutionId, {
          status: 'resolved',
          approval_id: approval.id,
          updated_at: timestamp,
        });
      }
      break;
    }
    case 'memory': {
      // A memory an agent wanted to keep. Approving activates it; anything else
      // archives it rather than deleting, so the record of what was proposed —
      // and refused — survives.
      const memoryId =
        typeof approval.payload.memory_id === 'string' ? approval.payload.memory_id : null;
      if (memoryId) {
        const memory = await store.get('agent_memory', memoryId).catch(() => null);
        if (memory) {
          await store.update('agent_memory', memoryId, {
            status: approved ? 'active' : 'archived',
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
