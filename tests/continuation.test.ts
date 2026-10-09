import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { continueMission, runMission } from '@/lib/workflows/runner';
import { resolveApproval } from '@/lib/workflows/approvals';
import { makeProductionWorkspace, OWNER_ID } from './helpers';

/** Demo Mode, as in production.test.ts. */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
  vi.stubEnv('VOICE_PROVIDER', '');
  vi.stubEnv('VOICE_PROVIDER_API_KEY', '');
  vi.stubEnv('IMAGE_PROVIDER', '');
  vi.stubEnv('IMAGE_PROVIDER_API_KEY', '');
});

async function approvedScriptMission() {
  const { store, business } = await makeProductionWorkspace();
  const { mission } = await createMission(store, {
    ownerId: OWNER_ID,
    businessId: business.id,
    title: 'Produce a video',
    objective: 'Full pipeline',
    workflowKey: 'youtube_video_full',
  });
  await runMission(store, OWNER_ID, mission.id);
  const gate = (await store.list('approvals', { where: { status: 'pending' } })).find(
    (a) => a.kind === 'script',
  )!;
  await resolveApproval(store, OWNER_ID, gate.id, 'approve');
  return { store, business, mission };
}

describe('continuing past the step ceiling', () => {
  it('says there is more to do when the ceiling, not the work, stopped it', async () => {
    // The production tail is longer than one request's ceiling. Tests that
    // passed maxSteps: 40 never saw this; the operator, on the default, did.
    const { store, mission } = await approvedScriptMission();
    const first = await runMission(store, OWNER_ID, mission.id);
    expect(first.haltedBecause).toBeNull();
    expect(first.hasMore).toBe(true);
    const pending = (await store.list('approvals', { where: { status: 'pending' } })).filter(
      (a) => a.kind === 'video',
    );
    expect(pending).toHaveLength(0);
  }, 120_000);

  it('reaches the final review on the default ceiling with no operator click', async () => {
    const { store, mission } = await approvedScriptMission();
    const result = await continueMission(store, OWNER_ID, mission.id);
    expect(result.hasMore).toBe(false);
    expect(result.haltedBecause).toMatch(/approval/i);
    const finalReview = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'video',
    );
    expect(finalReview).toBeTruthy();
  }, 120_000);

  it('never runs the same task twice when two runs overlap', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    // An approval's background continuation and an Advance click, at once.
    await Promise.all([
      runMission(store, OWNER_ID, mission.id),
      runMission(store, OWNER_ID, mission.id),
    ]);
    expect(await store.list('youtube_research', { where: { business_id: business.id } })).toHaveLength(1);
    expect(await store.list('youtube_scripts', { where: { business_id: business.id } })).toHaveLength(1);
    expect(
      (await store.list('approvals', { where: { status: 'pending' } })).filter((a) => a.kind === 'script'),
    ).toHaveLength(1);
  }, 120_000);
});
