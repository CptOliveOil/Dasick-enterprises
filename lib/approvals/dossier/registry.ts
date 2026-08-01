import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import type { Approval, ApprovalKind } from '@/types/domain';
import { approvalOutcomes, explainApproval } from '@/lib/operations/needs-you';
import { presetsFor } from '@/lib/approvals/presets';
import type { Dossier, DossierPart, Metric } from './types';

/**
 * The registry that makes the review experience inheritable.
 *
 * A builder answers one question — "given this approval, what should the
 * operator read?" — and returns panels. It does not render anything, does not
 * know what the page looks like, and cannot break another kind's screen. That
 * is what lets a business added next year get a full editorial review with no
 * front-end work: it registers a builder, or registers nothing at all and falls
 * back to the generic one, which is already a complete review rather than a
 * placeholder.
 *
 * The summary and the actions are assembled here for every kind, from the
 * approval itself. So the three parts the operator sees — what this is, what it
 * says, what happens if I press the button — exist whether or not anyone has
 * written a line of code for that kind.
 */

export interface DossierContext {
  store: DataStore;
  ownerId: string;
  approval: Approval;
}

export interface DossierBuilder {
  id: string;
  /** Restricts the builder to certain kinds. Omit to be offered every approval. */
  kinds?: ApprovalKind[];
  /**
   * Returns the panels, or null when this builder cannot handle the approval —
   * a script builder handed an approval whose script row has been deleted, for
   * instance. Returning null falls through to the next builder and ultimately
   * to the generic one, so a null is never an empty screen.
   */
  build(ctx: DossierContext): Promise<DossierPart | null>;
}

const BUILDERS: DossierBuilder[] = [];

export function registerDossier(builder: DossierBuilder): void {
  const existing = BUILDERS.findIndex((entry) => entry.id === builder.id);
  if (existing >= 0) BUILDERS.splice(existing, 1, builder);
  else BUILDERS.push(builder);
}

export function registeredDossiers(): readonly DossierBuilder[] {
  return BUILDERS;
}

/** Test seam. Restores the registry to a known state. */
export function resetDossiers(): void {
  BUILDERS.length = 0;
}

/* ------------------------------------------------------------------ */

export async function assembleDossier(
  ctx: DossierContext,
  fallback: DossierBuilder,
): Promise<Dossier> {
  const { approval } = ctx;

  let part: DossierPart | null = null;
  for (const builder of BUILDERS) {
    if (builder.kinds && !builder.kinds.includes(approval.kind)) continue;
    part = await builder.build(ctx);
    if (part) break;
  }
  part ??= (await fallback.build(ctx)) ?? { panels: [] };

  const outcomes = approvalOutcomes(approval.kind);
  const attribution = await describeProvenance(ctx);

  return {
    approval: {
      id: approval.id,
      kind: approval.kind,
      title: approval.title,
      summary: approval.summary,
      status: approval.status,
      created_at: approval.created_at,
      resolved_at: approval.resolved_at,
      feedback: approval.feedback,
    },
    summary: {
      title: part.summary?.title ?? approval.title,
      subtitle: part.summary?.subtitle ?? approval.summary,
      attribution: [...attribution, ...(part.summary?.attribution ?? [])],
      metrics: [...(part.summary?.metrics ?? []), ...payloadMetrics(approval)],
      notice: part.summary?.notice ?? payloadNotice(approval),
    },
    panels: part.panels,
    actions: {
      approve: {
        label: 'Approve',
        consequence: part.approveConsequence ?? outcomes.approve,
      },
      reject: { label: 'Reject', consequence: outcomes.reject },
      requestChanges: {
        label: 'Request changes',
        consequence:
          'The work goes back to the agent that produced it, with your notes. Nothing is discarded — the current version is kept and the next one arrives as a new version you can compare against it.',
        presets: part.presets ?? presetsFor(approval.kind),
      },
    },
    document: part.document ?? null,
    source: part.source ?? (part.panels.length > 0 ? 'records' : 'none'),
    href: part.href ?? null,
  };
}

/** Who produced this and what it belongs to. */
async function describeProvenance(ctx: DossierContext): Promise<{ label: string; value: string }[]> {
  const { store, approval } = ctx;
  const out: { label: string; value: string }[] = [];

  if (approval.business_id) {
    const business = await store.get('businesses', approval.business_id).catch(() => null);
    if (business) out.push({ label: 'Business', value: business.name });
  }
  if (approval.mission_id) {
    const mission = await store.get('missions', approval.mission_id).catch(() => null);
    if (mission) {
      out.push({
        label: 'Mission',
        value: `#${String(mission.number).padStart(3, '0')} · ${mission.title}`,
      });
    }
  }
  if (approval.agent_id) {
    const agent = await store.get('agents', approval.agent_id).catch(() => null);
    if (agent) out.push({ label: 'Agent', value: `${agent.name} · ${agent.role}` });
  }
  return out;
}

/** Figures worth surfacing whatever the kind, read straight off the payload. */
function payloadMetrics(approval: Approval): Metric[] {
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const metrics: Metric[] = [];

  if (typeof payload.count === 'number') {
    metrics.push({ label: 'Generated', value: String(payload.count) });
  }
  if (typeof payload.estimate === 'number') {
    metrics.push({
      label: 'Estimated cost',
      value: `£${payload.estimate.toFixed(2)}`,
      tone: 'amber',
      hint: 'What this step is expected to spend if you approve it.',
    });
  }
  return metrics;
}

function payloadNotice(approval: Approval): string | null {
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  if (payload.simulated === true) {
    return 'This output came from the simulated provider, not a real model. It is placeholder text and must not be treated as research.';
  }
  if (typeof payload.needs_live_data === 'number' && payload.needs_live_data > 0) {
    return `${payload.needs_live_data} of these need a live data source before they can be stated as fact.`;
  }
  if (approval.is_demo) {
    return 'This is demo data. Nothing here was produced by a real provider.';
  }
  return null;
}

/** Plain language for what approving does, used when nothing more specific exists. */
export function defaultAction(approval: Approval): string {
  return explainApproval(approval);
}
