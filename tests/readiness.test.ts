import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission, recomputeMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { runAgent } from '@/lib/agents/engine';
import { handleCommand } from '@/lib/agents/manager';
import { startOperationalReadiness } from '@/lib/workflows/readiness';
import { capabilityScope, businessCapabilitiesWithoutBusiness, ScopeViolation } from '@/lib/agents/scope';
import { makeReadinessWorkspace, OWNER_ID } from './helpers';

/**
 * Operational Readiness: the design bug was a system-level mission needing
 * business-scoped work with no business behind it. These tests prove the fix
 * holds at every layer the bug could have re-entered — the planner refuses
 * the invalid state outright, the fan-out gives every business its own
 * mission, nothing leaks between them, and a retry cannot blur that boundary.
 */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

describe('capability scope', () => {
  it('classifies system, business and mission capabilities correctly', () => {
    expect(capabilityScope('manager.briefing')).toBe('system');
    expect(capabilityScope('system.readiness.audit')).toBe('system');
    expect(capabilityScope('etsy.research.opportunities')).toBe('business');
    expect(capabilityScope('business.readiness.check')).toBe('business');
    // Depends on mission-local state a prior step produced, not on
    // business_id directly — never a capability's own new business row.
    expect(capabilityScope('youtube.script.revise')).toBe('mission');
    expect(capabilityScope('etsy.package.zip')).toBe('mission');
    // Unknown capabilities default to the permissive reading — most of the
    // codebase's capabilities tolerate a missing business — not to the
    // strict one, which would falsely block routes that have never failed.
    expect(capabilityScope('something.nobody.registered')).toBe('mission');
  });

  it('names every business capability with no business behind it', () => {
    expect(
      businessCapabilitiesWithoutBusiness(['etsy.research.opportunities', 'seo.keywords'], null),
    ).toEqual(['etsy.research.opportunities', 'seo.keywords']);
    expect(
      businessCapabilitiesWithoutBusiness(['etsy.research.opportunities'], 'some-business-id'),
    ).toEqual([]);
    // System and mission capabilities never appear, business or not.
    expect(businessCapabilitiesWithoutBusiness(['manager.briefing'], null)).toEqual([]);
    expect(businessCapabilitiesWithoutBusiness(['youtube.script.revise'], null)).toEqual([]);
  });
});

describe('system missions cannot accidentally write into businesses', () => {
  it('refuses to create a mission with a business capability and no business', async () => {
    const { store } = await makeReadinessWorkspace();
    await expect(
      createMission(store, {
        ownerId: OWNER_ID,
        businessId: null,
        title: 'Research opportunities',
        objective: 'x',
        steps: [
          {
            capability: 'etsy.research.opportunities',
            title: 'Research opportunities',
            depends_on: [],
          },
        ],
      }),
    ).rejects.toThrow(ScopeViolation);

    // Nothing was written — refusing means refusing, not creating a mission
    // that would fail its first task.
    expect(await store.list('missions', {})).toHaveLength(0);
  });

  it('lets the Manager refuse the same instruction with a plain-language reply instead of a thrown error', async () => {
    const { store } = await makeReadinessWorkspace();
    const result = await handleCommand(store, OWNER_ID, 'Research keywords for our shop.');
    // seo.keywords is business-scoped and this instruction names no business —
    // the Manager must say so, not create a mission doomed to fail its own
    // first task, and it must not guess a business either.
    if (result.mission) {
      // If a live model or a different route produced a plan that did resolve
      // a business, that is fine too — the invariant is just that nothing
      // unscoped was created.
      expect(result.mission.business_id).not.toBeNull();
    } else {
      expect(result.reply.toLowerCase()).toMatch(/business/);
      expect(result.missions).toHaveLength(0);
    }
  });

  it('permits an explicit, business-less orchestrator mission with no tasks of its own', async () => {
    const { store } = await makeReadinessWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: null,
      title: 'Orchestrator',
      objective: 'x',
      allowNoSteps: true,
    });
    expect(mission.business_id).toBeNull();
    expect(tasks).toHaveLength(0);
  });
});

describe('business missions always have a business context', () => {
  it('gives every business its own child mission, never null, never borrowed from another business', async () => {
    const { store, youtube, etsy } = await makeReadinessWorkspace();
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);

    expect(parent.business_id).toBeNull();
    expect(parent.parent_mission_id).toBeNull();

    const businessChildren = children.filter((c) => c.business_id !== null);
    expect(businessChildren).toHaveLength(2);
    expect(new Set(businessChildren.map((c) => c.business_id))).toEqual(
      new Set([youtube.id, etsy.id]),
    );
    for (const child of children) {
      expect(child.parent_mission_id).toBe(parent.id);
    }

    // Every task inside a business child carries that same business — the
    // task-level guarantee `createMission` already provides, still true once
    // fanned out.
    for (const child of businessChildren) {
      const tasks = await store.list('tasks', { where: { mission_id: child.id } });
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) expect(task.business_id).toBe(child.business_id);
    }
  });

  it('never invents a business when none are configured — the infrastructure audit still runs alone', async () => {
    const { store } = await makeReadinessWorkspace();
    // Strip both businesses so this genuinely tests the zero-business case.
    for (const business of await store.list('businesses', {})) {
      await store.remove('businesses', business.id);
    }
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);
    expect(children.filter((c) => c.business_id !== null)).toHaveLength(0);
    expect(children).toHaveLength(1); // infrastructure audit only
    expect(parent.business_id).toBeNull();
  });
});

describe('aggregated readiness', () => {
  it('rolls every child up into one report on the parent once all children finish', async () => {
    const { store } = await makeReadinessWorkspace();
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);

    for (const child of children) {
      await runMission(store, OWNER_ID, child.id, { maxSteps: 5 });
    }

    const finished = await store.get('missions', parent.id);
    expect(finished!.status).toBe('completed');
    expect(typeof finished!.context.report).toBe('string');
    const report = finished!.context.report as string;
    // Every area — both businesses and shared infrastructure — appears once.
    expect(report).toMatch(/Test YouTube readiness/);
    expect(report).toMatch(/Test Etsy Shop readiness/);
    expect(report).toMatch(/Shared infrastructure audit/);

    const messages = await store.list('command_messages', { where: { mission_id: parent.id } });
    const managerReport = messages.find((m) => m.role === 'manager' && m.content === report);
    expect(managerReport).toBeTruthy();
  });

  it('fails the parent when any child fails, without hiding which one', async () => {
    const { store, etsy } = await makeReadinessWorkspace();
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);

    for (const child of children) {
      if (child.business_id === etsy.id) {
        // Force this one child to fail, as if its check genuinely could not run.
        const tasks = await store.list('tasks', { where: { mission_id: child.id } });
        await store.update('tasks', tasks[0]!.id, { status: 'failed', error: 'Simulated failure.' });
        await recomputeMission(store, child.id);
      } else {
        await runMission(store, OWNER_ID, child.id, { maxSteps: 5 });
      }
    }

    const finished = await store.get('missions', parent.id);
    expect(finished!.status).toBe('failed');
    const report = finished!.context.report as string;
    expect(report).toMatch(/Test Etsy Shop readiness.*failed/s);
  });
});

describe('retries preserve business isolation', () => {
  it('a retried child stays scoped to its own business and never touches the other', async () => {
    const { store, youtube, etsy } = await makeReadinessWorkspace();
    const { parent, children } = await startOperationalReadiness(store, OWNER_ID);

    const youtubeChild = children.find((c) => c.business_id === youtube.id)!;
    const etsyChild = children.find((c) => c.business_id === etsy.id)!;
    const infraChild = children.find((c) => c.business_id === null)!;

    // Run the Etsy and infrastructure children to completion first, and
    // record their exact output — this is what "untouched by someone else's
    // retry" means concretely.
    await runMission(store, OWNER_ID, etsyChild.id, { maxSteps: 5 });
    await runMission(store, OWNER_ID, infraChild.id, { maxSteps: 5 });
    const etsyTaskBefore = (await store.list('tasks', { where: { mission_id: etsyChild.id } }))[0]!;

    // Fail the YouTube child, then retry it — the same re-queue a rework or
    // an operator retry would do.
    const youtubeTask = (await store.list('tasks', { where: { mission_id: youtubeChild.id } }))[0]!;
    await store.update('tasks', youtubeTask.id, { status: 'failed', error: 'Simulated failure.' });
    await recomputeMission(store, youtubeChild.id);
    expect((await store.get('missions', youtubeChild.id))!.status).toBe('failed');

    await store.update('tasks', youtubeTask.id, {
      status: 'queued',
      error: null,
      output: null,
      started_at: null,
      completed_at: null,
    });
    const retried = await runAgent(store, OWNER_ID, youtubeTask.id);
    expect(retried.status).toBe('completed');
    await recomputeMission(store, youtubeChild.id);

    // The retried task is still scoped to YouTube, and only YouTube.
    const youtubeTaskAfter = await store.get('tasks', youtubeTask.id);
    expect(youtubeTaskAfter!.business_id).toBe(youtube.id);
    expect(youtubeTaskAfter!.mission_id).toBe(youtubeChild.id);

    // The Etsy child's own task — a completely different mission, business
    // and task row — is byte-for-byte unaffected by the YouTube retry.
    const etsyTaskAfter = (await store.list('tasks', { where: { mission_id: etsyChild.id } }))[0]!;
    expect(etsyTaskAfter).toEqual(etsyTaskBefore);
    expect(etsyTaskAfter.business_id).toBe(etsy.id);

    // Aggregation after the retry still attributes each finding to the right
    // business — nothing about the YouTube retry bled into the Etsy section.
    const finished = await store.get('missions', parent.id);
    expect(finished!.status).toBe('completed');
    const report = finished!.context.report as string;
    const etsySection = report.split('Test YouTube readiness')[0]!;
    expect(etsySection).not.toMatch(/Simulated failure/);
  });
});
