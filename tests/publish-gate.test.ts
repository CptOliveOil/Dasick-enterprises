import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { continueMission } from '@/lib/workflows/runner';
import { resolveApproval } from '@/lib/workflows/approvals';
import { AGENT_SEEDS } from '@/lib/db/seed';
import { canPerform } from '@/lib/agents/authority';
import type { PublishRequest } from '@/lib/integrations/providers/types';
import { makeProductionWorkspace, OWNER_ID } from './helpers';

/**
 * A publisher that records what it was asked to upload, so the test can check
 * the request a real adapter would receive — in particular that the file path
 * is one a real adapter could actually open.
 */
const uploads: PublishRequest[] = [];
vi.mock('@/lib/integrations/providers/registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/integrations/providers/registry')>();
  return {
    ...original,
    getPublisher: () => ({
      descriptor: {
        kind: 'publisher',
        name: 'Recording publisher',
        connected: true,
        requiredEnv: [],
        capabilities: ['publish'],
        pricingNote: '',
        simulated: true,
      },
      isConnected: () => true,
      publish: async (request: PublishRequest) => {
        uploads.push(request);
        return {
          externalId: 'recorded-upload',
          url: null,
          visibility: request.visibility,
          simulated: true,
        };
      },
    }),
  };
});

beforeEach(() => {
  uploads.length = 0;
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
  vi.stubEnv('VOICE_PROVIDER', '');
  vi.stubEnv('VOICE_PROVIDER_API_KEY', '');
  vi.stubEnv('IMAGE_PROVIDER', '');
  vi.stubEnv('IMAGE_PROVIDER_API_KEY', '');
});

async function pending(store: Awaited<ReturnType<typeof makeProductionWorkspace>>['store'], kind: string) {
  return (await store.list('approvals', { where: { status: 'pending' } })).find((a) => a.kind === kind);
}

/** Runs a full mission to final approval and approves it. */
async function finallyApproved() {
  const workspace = await makeProductionWorkspace();
  const { store, business } = workspace;
  const { mission } = await createMission(store, {
    ownerId: OWNER_ID,
    businessId: business.id,
    title: 'Produce a video',
    objective: 'Full pipeline',
    workflowKey: 'youtube_video_full',
  });
  await continueMission(store, OWNER_ID, mission.id);
  await resolveApproval(store, OWNER_ID, (await pending(store, 'script'))!.id, 'approve');
  await continueMission(store, OWNER_ID, mission.id);
  const finalReview = (await pending(store, 'video'))!;
  await resolveApproval(store, OWNER_ID, finalReview.id, 'approve');
  await continueMission(store, OWNER_ID, mission.id);
  return { ...workspace, mission, videoId: finalReview.payload.video_id as string };
}

describe('the upload gate', () => {
  it('uploads nothing on final approval, and asks for the upload explicitly', async () => {
    const { store, videoId } = await finallyApproved();
    expect(uploads).toHaveLength(0);

    const gate = await pending(store, 'publish');
    expect(gate).toBeTruthy();
    expect(gate!.payload.visibility).toBe('private');
    expect(gate!.payload.video_id).toBe(videoId);

    const video = await store.get('youtube_videos', videoId);
    expect(video!.status).toBe('ready');
    expect(video!.published_external_id).toBeNull();
  }, 180_000);

  it('uploads privately once authorised, from a file that exists on this disk', async () => {
    const { store, mission } = await finallyApproved();
    await resolveApproval(store, OWNER_ID, (await pending(store, 'publish'))!.id, 'approve');
    const result = await continueMission(store, OWNER_ID, mission.id);

    expect(uploads).toHaveLength(1);
    const [upload] = uploads;
    expect(upload!.visibility).toBe('private');
    // The storage key is relative to the media root; the adapter reads the
    // path it is given, so it must be the real absolute file.
    expect(path.isAbsolute(upload!.videoPath)).toBe(true);
    expect(existsSync(upload!.videoPath)).toBe(true);

    // Analytics ran after it (and recorded nothing, because nothing is real).
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    expect(tasks.find((t) => t.step_key === 'publish')!.status).toBe('completed');
    expect(tasks.find((t) => t.step_key === 'analytics')!.status).toBe('completed');
    expect(result.status).toBe('completed');
  }, 180_000);

  it('a rejected upload uploads nothing', async () => {
    const { store, mission } = await finallyApproved();
    await resolveApproval(store, OWNER_ID, (await pending(store, 'publish'))!.id, 'reject');
    await continueMission(store, OWNER_ID, mission.id);
    expect(uploads).toHaveLength(0);
  }, 180_000);
});

describe('seeded workforce', () => {
  it('gives every built-in agent with capabilities enough authority to run them', () => {
    // The YouTube Analyst sat at level 0 — below the level every run needs —
    // so publish, analytics collection and channel analysis always failed.
    for (const seed of AGENT_SEEDS.filter((s) => s.capabilities.length > 0)) {
      expect(canPerform(seed.authority_level, 'draft').allowed, seed.slug).toBe(true);
    }
  });
});

describe('workspaces provisioned with the old level-0 analyst', () => {
  async function analyticsMission(overrides: { is_custom: boolean }) {
    const { makeAgent, makeWorkspace } = await import('./helpers');
    const { store, business } = await makeWorkspace();
    const analyst = makeAgent({
      name: 'YouTube Analyst',
      slug: 'youtube-analyst',
      business_id: business.id,
      authority_level: 0,
      capabilities: ['youtube.analytics.collect'],
      ...overrides,
    });
    await store.insert('agents', analyst);
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Collect analytics',
      objective: 'Collect',
      steps: [{ capability: 'youtube.analytics.collect', title: 'Collect analytics' }],
    });
    const result = await continueMission(store, OWNER_ID, mission.id);
    return { store, analyst, result };
  }

  it('corrects the built-in agent to the seed level and runs the step', async () => {
    const { store, analyst, result } = await analyticsMission({ is_custom: false });
    expect(result.results[0]!.status).toBe('completed');
    expect((await store.get('agents', analyst.id))!.authority_level).toBe(3);
    const logs = await store.list('activity_logs', { where: { agent_id: analyst.id } });
    expect(logs.some((log) => /authority corrected from level 0 to 3/.test(log.message))).toBe(true);
  });

  it('never raises a custom agent the operator built', async () => {
    const { store, analyst, result } = await analyticsMission({ is_custom: true });
    expect(result.results[0]!.status).toBe('failed');
    expect((await store.get('agents', analyst.id))!.authority_level).toBe(0);
  });
});
