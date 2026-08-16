import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPermission } from '@/lib/auth/session';
import type { DataStore } from '@/lib/db/tables';
import { logActivity, notify } from '@/lib/agents/activity';
import { resolveAgentForCapability } from '@/lib/workflows/engine';
import { uuid } from '@/lib/ids';
import { RESOLUTION_ACTIONS, type SourceResolution } from '@/types/islamic';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  item_id: z.string().uuid(),
  action: z.enum(RESOLUTION_ACTIONS),
  /** The reference supplied for `add_source`. */
  source: z.string().trim().max(1000).optional(),
  /** Replacement wording for `edit_claim`. */
  claim: z.string().trim().max(2000).optional(),
  /** Required for `override`; optional elsewhere. */
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Settles one unsourced claim.
 *
 * Every action is recorded against the claim, and an override records who did
 * it, when, and why — because an override is a decision to let something
 * unverified through, and that decision has to remain visible right up to the
 * moment the video is approved.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid resolution.' }, { status: 400 });
  }
  const { item_id: itemId, action, source, claim, reason } = parsed.data;

  const guard = await guardPermission('tasks.approve');
  if ('response' in guard) return guard.response;
  const { store, ownerId, profile } = guard;

  const record = await store.get('source_resolutions', id);
  if (!record || record.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Resolution not found.' }, { status: 404 });
  }

  const item = record.items.find((entry) => entry.id === itemId);
  if (!item) return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  if (item.status !== 'unresolved') {
    return NextResponse.json({ error: 'That claim is already settled.' }, { status: 409 });
  }

  if (action === 'add_source' && !source) {
    return NextResponse.json({ error: 'Give the reference you are adding.' }, { status: 400 });
  }
  if (action === 'edit_claim' && !claim) {
    return NextResponse.json({ error: 'Give the replacement wording.' }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  let researchTaskId: string | null = null;

  // "Research" is not a resolution — it is asking the checker to try again, so
  // the claim stays unresolved and the gate stays open until it comes back.
  if (action === 'research') {
    researchTaskId = await requestResearch(store, ownerId, record, item);
    if (!researchTaskId) {
      return NextResponse.json(
        {
          error:
            'No available agent provides islamic.source_verify, so there is nobody to research this. Assign an Islamic Source Checker to this channel first.',
        },
        { status: 409 },
      );
    }
  }

  const settled: SourceResolution =
    action === 'research'
      ? { ...item, action: 'research' }
      : {
          ...item,
          status: action === 'remove_claim' ? 'removed' : action === 'override' ? 'overridden' : 'resolved',
          action,
          resolved_source: action === 'add_source' ? (source ?? null) : item.resolved_source,
          edited_claim: action === 'edit_claim' ? (claim ?? null) : item.edited_claim,
          override_reason: action === 'override' ? (reason ?? null) : null,
          resolved_by: ownerId,
          resolved_at: timestamp,
        };

  const items = record.items.map((entry) => (entry.id === itemId ? settled : entry));
  const open = items.some((entry) => entry.status === 'unresolved');

  const updated = await store.update('source_resolutions', id, {
    items,
    status: open ? 'open' : 'resolved',
    updated_at: timestamp,
  });

  await logActivity(store, {
    ownerId,
    businessId: record.business_id,
    missionId: record.mission_id,
    taskId: record.task_id,
    kind: action === 'override' ? 'blocked' : 'system',
    message:
      action === 'override'
        ? `${profile.display_name} overrode an unsourced claim — "${truncate(item.claim)}"${reason ? ` (${reason})` : ''}`
        : `${profile.display_name} ${describe(action)} — "${truncate(item.claim)}"`,
    metadata: { resolution_id: id, item_id: itemId, action, reason: reason ?? null },
  });

  if (action === 'override') {
    // An override should be findable later without hunting for it.
    await notify(store, {
      ownerId,
      kind: 'mission_blocked',
      title: 'An unsourced claim was overridden',
      body: `"${truncate(item.claim)}" was allowed through without a verified source. It stays flagged on the final quality check.`,
      href: record.video_id ? `/youtube/production/${record.video_id}` : '/approvals',
    });
  }

  return NextResponse.json({
    resolution: updated,
    open,
    research_task_id: researchTaskId,
  });
}

function describe(action: string): string {
  switch (action) {
    case 'add_source':
      return 'added a source';
    case 'edit_claim':
      return 'edited a claim';
    case 'remove_claim':
      return 'removed a claim';
    default:
      return 'resolved a claim';
  }
}

function truncate(text: string, max = 90): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Queues a fresh check for one claim.
 *
 * A real task on a real agent, so its planet lights up and the work is costed
 * and logged like everything else. Returns null when nothing can do the work,
 * which the caller reports rather than silently creating a task that can never
 * run.
 */
async function requestResearch(
  store: DataStore,
  ownerId: string,
  record: { business_id: string; mission_id: string | null; script_id: string | null; id: string },
  item: SourceResolution,
): Promise<string | null> {
  const agentId = await resolveAgentForCapability(
    store,
    ownerId,
    'islamic.source_verify',
    record.business_id,
  );
  if (!agentId) return null;

  const timestamp = new Date().toISOString();
  const task = await store.insert('tasks', {
    id: uuid(),
    owner_id: ownerId,
    mission_id: record.mission_id,
    business_id: record.business_id,
    agent_id: agentId,
    step_key: 'source_research',
    title: `Research a source for: ${truncate(item.claim, 60)}`,
    description: item.reason,
    status: 'queued',
    priority: 'high',
    input: {
      capability: 'islamic.source_verify',
      resolution_id: record.id,
      resolution_item_id: item.id,
      script_id: record.script_id,
      claim: item.claim,
      instructions: `The operator has asked you to look again at one specific claim: "${item.claim}". Say plainly whether you can place it in a named source. If you cannot, say so — do not supply a reference from memory.`,
    },
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: timestamp,
    started_at: null,
    completed_at: null,
    due_at: null,
    claimed_at: null,
    heartbeat_at: null,
    reclaim_count: 0,
  });

  return task.id;
}
