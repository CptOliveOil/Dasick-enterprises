import type {
  Agent,
  Approval,
  ApprovalKind,
  Business,
  Mission,
  Task,
} from '@/types/domain';

/**
 * Everything waiting on the operator, in one list.
 *
 * The rule this file exists to keep: **the count here equals the number of
 * things that genuinely need a person.** Every entry is derived from a real
 * pending approval or a real stuck task — nothing is invented to fill the
 * panel, and nothing that needs attention is left out of it. A "needs you"
 * panel that is wrong in either direction is worse than none at all, because
 * the operator stops trusting the number and starts checking everything
 * manually.
 */

export const URGENCY_LEVELS = ['critical', 'high', 'normal', 'low'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export type NeedsYouKind =
  | 'approval'
  | 'source_resolution'
  | 'failed_task'
  | 'stalled_task'
  | 'provider_required';

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  /** The approval kind, when this came from one. Drives the inbox grouping. */
  approvalKind: ApprovalKind | null;
  title: string;
  /** One sentence saying what the operator is actually deciding. */
  explanation: string;
  businessId: string | null;
  businessName: string | null;
  missionId: string | null;
  missionNumber: number | null;
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
  urgency: Urgency;
  /** Where to go for the full picture. */
  href: string;
  /** True when Approve/Reject can safely be offered inline. */
  inlineDecision: boolean;
}

const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Roughly a working day. Older than this and an approval is holding things up. */
const STALE_APPROVAL_MS = 24 * 60 * 60 * 1000;

export interface NeedsYouInput {
  businesses: Business[];
  agents: Agent[];
  missions: Mission[];
  tasks: Task[];
  approvals: Approval[];
  now?: number;
}

export function buildNeedsYou(input: NeedsYouInput): NeedsYouItem[] {
  const now = input.now ?? Date.now();
  const businessName = (id: string | null) =>
    id ? (input.businesses.find((b) => b.id === id)?.name ?? null) : null;
  const agentName = (id: string | null) =>
    id ? (input.agents.find((a) => a.id === id)?.name ?? null) : null;
  const mission = (id: string | null) =>
    id ? (input.missions.find((m) => m.id === id) ?? null) : null;

  const items: NeedsYouItem[] = [];

  for (const approval of input.approvals) {
    if (approval.status !== 'pending') continue;
    const owningMission = mission(approval.mission_id);
    items.push({
      id: `approval:${approval.id}`,
      kind: approval.kind === 'source' ? 'source_resolution' : 'approval',
      approvalKind: approval.kind,
      title: approval.title,
      explanation: explainApproval(approval),
      businessId: approval.business_id,
      businessName: businessName(approval.business_id),
      missionId: approval.mission_id,
      missionNumber: owningMission?.number ?? null,
      agentId: approval.agent_id,
      agentName: agentName(approval.agent_id),
      createdAt: approval.created_at,
      urgency: approvalUrgency(approval, owningMission, now),
      href: approvalHref(approval),
      // A source gate is a set of per-claim decisions, and spending is worth
      // reading properly. Neither belongs behind a one-click Approve.
      inlineDecision: approval.kind !== 'source' && approval.kind !== 'spend',
    });
  }

  for (const task of input.tasks) {
    if (task.status !== 'failed') continue;
    const owningMission = mission(task.mission_id);
    // A failed task inside a mission that has already been cancelled is history,
    // not a decision.
    if (owningMission && ['cancelled', 'completed'].includes(owningMission.status)) continue;

    const providerProblem = /not connected|provider|credential|api key/i.test(task.error ?? '');
    items.push({
      id: `task:${task.id}`,
      kind: providerProblem ? 'provider_required' : 'failed_task',
      approvalKind: null,
      title: task.title,
      explanation: providerProblem
        ? `${task.error ?? 'A provider is missing.'} Nothing was faked — the step stopped.`
        : `This step failed and the mission cannot continue past it. ${task.error ?? ''}`.trim(),
      businessId: task.business_id,
      businessName: businessName(task.business_id),
      missionId: task.mission_id,
      missionNumber: owningMission?.number ?? null,
      agentId: task.agent_id,
      agentName: agentName(task.agent_id),
      createdAt: task.completed_at ?? task.created_at,
      urgency: owningMission?.priority === 'critical' ? 'critical' : 'high',
      href: task.mission_id ? `/missions/${task.mission_id}` : '/tasks',
      inlineDecision: false,
    });
  }

  // A task with no agent can never run. It is not failed — it simply has nobody
  // to do it, which is a decision for the operator, not a retry.
  for (const task of input.tasks) {
    if (task.status !== 'queued' && task.status !== 'waiting') continue;
    if (task.agent_id) continue;
    const owningMission = mission(task.mission_id);
    if (owningMission && ['cancelled', 'completed', 'failed'].includes(owningMission.status)) {
      continue;
    }
    items.push({
      id: `unassigned:${task.id}`,
      kind: 'stalled_task',
      approvalKind: null,
      title: task.title,
      explanation:
        task.error ??
        'No available agent provides this capability, so this step can never start. Create or enable an agent that covers it.',
      businessId: task.business_id,
      businessName: businessName(task.business_id),
      missionId: task.mission_id,
      missionNumber: owningMission?.number ?? null,
      agentId: null,
      agentName: null,
      createdAt: task.created_at,
      urgency: 'high',
      href: '/agents',
      inlineDecision: false,
    });
  }

  return items.sort((a, b) => {
    if (URGENCY_ORDER[a.urgency] !== URGENCY_ORDER[b.urgency]) {
      return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    }
    // Oldest first within a band: the thing that has been waiting longest is
    // the thing most likely to be holding something up.
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Plain language for what a decision actually does.
 *
 * The operator should never have to read a task payload to work out what they
 * are agreeing to.
 */
export function explainApproval(approval: Approval): string {
  switch (approval.kind) {
    case 'script':
      return 'Approving starts production and allows spending. Rejecting cancels the mission; requesting changes sends the script back for another draft.';
    case 'source':
      return 'Religious claims could not be verified. Each one needs a source, an edit, a removal, or a deliberate override before anything continues.';
    case 'video':
      return 'The video is finished and passed quality control. Approving marks it ready to publish — it does not publish it.';
    case 'spend':
      return 'An agent needs permission to spend on this one step. Approving authorises that step only, not future spending.';
    case 'publish':
      return 'This would publish externally. Approving makes the content public.';
    case 'thumbnail':
      return 'Approving selects these thumbnail concepts for rendering.';
    case 'idea':
      return 'Approving moves this idea into research and scripting.';
    case 'research':
      return 'Approving accepts this research package as the basis for a script.';
    case 'listing':
      return 'Approving marks the listing ready. Publishing to Etsy is a separate, gated action.';
    case 'memory':
      return 'An agent wants to keep a durable rule that will shape every future mission on this business. Approving activates it; rejecting archives it.';
    case 'product':
      return 'Approving accepts this product for listing work.';
    default:
      return approval.summary;
  }
}

/** What happens on each outcome, for the inbox. */
export function approvalOutcomes(kind: ApprovalKind): { approve: string; reject: string } {
  switch (kind) {
    case 'script':
      return {
        approve: 'Production begins and the budget opens.',
        reject: 'The mission stops here.',
      };
    case 'source':
      return {
        approve: 'The mission continues with every claim settled.',
        reject: 'The mission stops until the claims are dealt with.',
      };
    case 'video':
      return { approve: 'Marked ready to publish.', reject: 'Sent back; nothing is published.' };
    case 'spend':
      return { approve: 'That one step may spend.', reject: 'The step stays stopped.' };
    case 'publish':
      return { approve: 'Published externally.', reject: 'Nothing is published.' };
    case 'memory':
      return {
        approve: 'The rule applies to future runs.',
        reject: 'The rule is archived and never loaded.',
      };
    default:
      return { approve: 'The mission continues.', reject: 'The mission stops here.' };
  }
}

function approvalUrgency(approval: Approval, mission: Mission | null, now: number): Urgency {
  if (mission?.priority === 'critical') return 'critical';
  // Anything blocking money or publication is worth surfacing above routine work.
  if (approval.kind === 'spend' || approval.kind === 'publish') return 'high';
  if (mission?.priority === 'high') return 'high';
  const age = now - new Date(approval.created_at).getTime();
  if (age > STALE_APPROVAL_MS) return 'high';
  return 'normal';
}

function approvalHref(approval: Approval): string {
  const payload = approval.payload as Record<string, unknown>;
  if (approval.kind === 'video' && typeof payload.video_id === 'string') {
    return `/youtube/production/${payload.video_id}`;
  }
  if (approval.kind === 'script' && typeof payload.script_id === 'string') {
    return `/youtube/scripts/${payload.script_id}`;
  }
  if (approval.kind === 'source') return '/approvals';
  if (approval.mission_id) return `/missions/${approval.mission_id}`;
  return '/approvals';
}
