import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import type { Mission } from '@/types/domain';
import { createMission } from './engine';

/**
 * Operational Readiness: the system-level mission that checks whether every
 * business, and shared infrastructure, is ready to operate.
 *
 * Its business-scoped work cannot run as tasks on the parent mission — the
 * parent has no business, and never silently borrows one (see
 * `lib/agents/scope.ts`). Instead it fans out: one readiness mission per
 * configured business, each running entirely inside that business' own
 * context, plus one system-scoped mission for shared infrastructure. The
 * parent has no tasks of its own; its status is derived purely from its
 * children (`deriveParentMissionState` in `lib/workflows/engine.ts`), and its
 * report is built once every child has finished, wherever that finish
 * happens — a normal run or a retry.
 */

export interface OperationalReadinessRun {
  parent: Mission;
  children: Mission[];
}

export async function startOperationalReadiness(
  store: DataStore,
  ownerId: string,
): Promise<OperationalReadinessRun> {
  // Every configured business, exactly as configured — never filtered to
  // "the first one" and never invented when there are none.
  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });

  const { mission: parent } = await createMission(store, {
    ownerId,
    businessId: null,
    title: 'Operational Readiness',
    objective: 'Verify every business, and shared infrastructure, is ready to operate.',
    context: { kind: 'operational_readiness' },
    allowNoSteps: true,
  });

  const children: Mission[] = [];
  for (const business of businesses) {
    const { mission } = await createMission(store, {
      ownerId,
      businessId: business.id,
      parentMissionId: parent.id,
      title: `${business.name} readiness`,
      objective: `Verify ${business.name} is ready to operate.`,
      workflowKey: 'business_readiness',
      context: { kind: 'operational_readiness_child', readiness_area: business.slug },
    });
    children.push(mission);
  }

  const { mission: infrastructure } = await createMission(store, {
    ownerId,
    businessId: null,
    parentMissionId: parent.id,
    title: 'Shared infrastructure audit',
    objective: 'Verify shared providers, budgets and system configuration.',
    workflowKey: 'system_readiness',
    context: { kind: 'operational_readiness_child', readiness_area: 'infrastructure' },
  });
  children.push(infrastructure);

  return { parent, children };
}

/**
 * Rolls every completed child's finding into one report, attaches it to the
 * parent mission's own record (so it can be found again, not just read once
 * in chat), and posts it as the Commander's reply.
 *
 * Called from `recomputeMission` the moment the parent transitions to
 * `completed` or `failed` — i.e. the moment the last child finishes, however
 * it got there.
 */
export async function finalizeReadinessReport(store: DataStore, parent: Mission): Promise<void> {
  const children = await store.list('missions', { where: { parent_mission_id: parent.id } });
  const sorted = [...children].sort((a, b) => a.title.localeCompare(b.title));

  const sections: { area: string; verdict: string; findings: string[] }[] = [];
  for (const child of sorted) {
    const tasks = await store.list('tasks', { where: { mission_id: child.id } });
    const task = tasks[0];
    const output = task?.output as Record<string, unknown> | null | undefined;
    let verdict: string;
    let findings: string[];
    if (output && typeof output.verdict === 'string') {
      verdict = output.verdict;
      findings = Array.isArray(output.findings) ? (output.findings as string[]) : [];
    } else {
      // The child never produced a structured result — it failed, or was
      // cancelled upstream. Say so rather than reporting "ready".
      verdict = child.status;
      findings = task?.error ? [task.error] : [];
    }
    sections.push({ area: child.title, verdict, findings });
  }

  const needsAttention = sections.filter((s) => s.verdict !== 'ready');
  const headline =
    needsAttention.length === 0
      ? `Everything is ready — ${sections.length} area${sections.length === 1 ? '' : 's'} checked, nothing needs attention.`
      : `${needsAttention.length} of ${sections.length} area${sections.length === 1 ? '' : 's'} need${needsAttention.length === 1 ? 's' : ''} attention.`;

  const lines = [headline, ''];
  for (const section of sections) {
    lines.push(`${section.verdict === 'ready' ? '✓' : '⚠'} ${section.area} — ${section.verdict}`);
    for (const finding of section.findings) lines.push(`  - ${finding}`);
  }
  const report = lines.join('\n');
  const timestamp = new Date().toISOString();

  await store.update('missions', parent.id, {
    context: { ...parent.context, report, report_generated_at: timestamp },
  });

  await store.insert('command_messages', {
    id: uuid(),
    owner_id: parent.owner_id,
    role: 'manager',
    content: report,
    mission_id: parent.id,
    refs: { readiness: children.map((c) => c.id) },
    created_at: timestamp,
  });
}
