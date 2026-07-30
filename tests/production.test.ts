import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { resolveApproval } from '@/lib/workflows/approvals';
import { runAgent } from '@/lib/agents/engine';
import { checkSpend, getBudget, videoSpend } from '@/lib/finance/budgets';
import { buildCues, toSrt, toVtt } from '@/lib/media/captions';
import { makeProductionWorkspace, OWNER_ID } from './helpers';

/**
 * Demo Mode: no database and no provider keys, so the simulated media
 * providers stand in and every asset they make is flagged.
 */
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

describe('script approval gate', () => {
  it('stops the pipeline at the script and starts no production work', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });

    const run = await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    expect(run.haltedBecause).toContain('approval');

    const approvals = await store.list('approvals', { where: { status: 'pending' } });
    const script = approvals.find((a) => a.kind === 'script');
    expect(script).toBeTruthy();
    // The gate carries what the operator needs to decide on one screen.
    expect(script!.payload.script_id).toBeTruthy();
    expect(script!.payload).toHaveProperty('word_count');
    expect(script!.payload).toHaveProperty('warnings');

    // Nothing downstream of the gate may have run.
    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    for (const key of ['voiceover_plan', 'voiceover', 'visual_plan', 'assets', 'assembly']) {
      const task = tasks.find((t) => t.step_key === key)!;
      expect(['waiting', 'queued']).toContain(task.status);
      expect(task.output).toBeNull();
    }
    expect(await store.list('media_assets')).toHaveLength(0);
  });

  it('marks the script approved and releases production when approved', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });

    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, approval.id, 'approve');

    const script = await store.get('youtube_scripts', approval.payload.script_id as string);
    expect(script!.status).toBe('approved');
  });

  it('returns the script to the writer when changes are requested', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    const approval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'script',
    )!;

    await resolveApproval(
      store,
      OWNER_ID,
      approval.id,
      'request_changes',
      'Make the first 30 seconds more engaging.',
    );

    const task = await store.get('tasks', approval.task_id!);
    expect(task!.status).toBe('queued');
    expect(task!.input.operator_feedback).toBe('Make the first 30 seconds more engaging.');

    // Earlier script versions survive a revision request.
    const versions = await store.list('youtube_script_versions');
    expect(versions.length).toBeGreaterThan(0);
  });
});

describe('production pipeline in Demo Mode', () => {
  it('runs from approved script to a rendered video awaiting final approval', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });

    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    const scriptApproval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, scriptApproval.id, 'approve');

    // Enough steps for the whole downstream pipeline.
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 25 });

    const videos = await store.list('youtube_videos', { where: { business_id: business.id } });
    const video = videos[0]!;
    expect(video).toBeTruthy();

    const scenes = await store.list('youtube_scenes', { where: { video_id: video.id } });
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every((s) => s.asset_id)).toBe(true);

    const assets = await store.list('media_assets', { where: { video_id: video.id } });
    expect(assets.some((a) => a.type === 'voiceover')).toBe(true);
    expect(assets.some((a) => a.type === 'image' || a.type === 'video_clip')).toBe(true);
    expect(assets.some((a) => a.type === 'final_video')).toBe(true);
    expect(assets.some((a) => a.type === 'subtitle_file')).toBe(true);

    // A rendered file exists and is genuinely on disk with a real size.
    const finalVideo = assets.find((a) => a.type === 'final_video')!;
    expect(finalVideo.status).toBe('ready');
    expect(finalVideo.file_size).toBeGreaterThan(1000);
    expect(finalVideo.duration).toBeGreaterThan(0);

    // Every simulated asset is flagged, and never given a fake public URL.
    const simulated = assets.filter((a) => a.simulated);
    expect(simulated.length).toBeGreaterThan(0);
    for (const asset of simulated) expect(asset.public_url).toBeNull();

    const qc = await store.list('youtube_quality_checks', { where: { video_id: video.id } });
    expect(qc).toHaveLength(1);
    expect(['pass', 'warning']).toContain(qc[0]!.verdict);
    // QC measured the file rather than assuming.
    expect(qc[0]!.measured.duration_seconds).toBeGreaterThan(0);
    expect(qc[0]!.measured.has_audio_track).toBe(true);
    // Simulated media is always surfaced as a warning.
    expect(qc[0]!.issues.some((i) => i.code === 'simulated_assets')).toBe(true);

    const finalApproval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'video',
    );
    expect(finalApproval).toBeTruthy();

    const updated = await store.get('youtube_videos', video.id);
    expect(updated!.stage).toBe('final_approval');
    // Not published, and not claiming to be.
    expect(updated!.published_external_id).toBeNull();
  }, 180_000);

  it('marks the video ready to publish, never published, on final approval', async () => {
    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    const scriptApproval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, scriptApproval.id, 'approve');
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 25 });

    const finalApproval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'video',
    )!;
    await resolveApproval(store, OWNER_ID, finalApproval.id, 'approve');

    const video = await store.get('youtube_videos', finalApproval.payload.video_id as string);
    expect(video!.status).toBe('ready');
    expect(video!.stage).toBe('publish');
    expect(video!.published_external_id).toBeNull();
  }, 180_000);
});

describe('media providers disconnected', () => {
  it('blocks the voiceover step and names the missing provider', async () => {
    // Simulated media off while the AI stays simulated, which isolates the
    // property under test: a missing *media* provider must stop the step rather
    // than invent audio. Turning Supabase on instead would make this a real
    // workspace, where the script step would fail for want of Anthropic long
    // before the pipeline ever reached narration — that behaviour has its own
    // tests in real-mode.test.ts.
    vi.stubEnv('DISABLE_SIMULATED_MEDIA', 'true');
    vi.resetModules();

    const { store, business } = await makeProductionWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: business.id,
      title: 'Produce a video',
      objective: 'Full pipeline',
      workflowKey: 'youtube_video_full',
    });
    await runMission(store, OWNER_ID, mission.id, { maxSteps: 12 });
    const scriptApproval = (await store.list('approvals', { where: { status: 'pending' } })).find(
      (a) => a.kind === 'script',
    )!;
    await resolveApproval(store, OWNER_ID, scriptApproval.id, 'approve');

    // Run generously: other branches may reach their own gates first, but the
    // voiceover step must never invent audio.
    for (let i = 0; i < 4; i += 1) {
      await runMission(store, OWNER_ID, mission.id, { maxSteps: 10 });
    }

    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    const voiceoverTask = tasks.find((t) => t.step_key === 'voiceover')!;
    expect(voiceoverTask.error).toMatch(/voice provider/i);
    expect(voiceoverTask.error).toMatch(/VOICE_PROVIDER/);

    // Nothing was fabricated in place of the missing provider.
    const assets = await store.list('media_assets');
    expect(assets.filter((a) => a.type === 'voiceover')).toHaveLength(0);

    const videos = await store.list('youtube_videos', { where: { business_id: business.id } });
    expect(videos[0]!.status).toBe('blocked');
    expect(videos[0]!.blocked_reason).toMatch(/voice provider/i);
  }, 120_000);
});

describe('production budgets', () => {
  it('creates a conservative default budget on first use', async () => {
    const { store, business } = await makeProductionWorkspace();
    const budget = await getBudget(store, OWNER_ID, business.id);
    expect(budget.max_cost_per_video).toBeGreaterThan(0);
    expect(budget.approval_threshold).toBeGreaterThan(0);
    expect(budget.approval_threshold).toBeLessThan(budget.max_cost_per_video);
  });

  it('requires approval at or above the threshold', async () => {
    const { store, business } = await makeProductionWorkspace();
    const budget = await getBudget(store, OWNER_ID, business.id);
    const check = await checkSpend(
      store,
      OWNER_ID,
      business.id,
      null,
      'other',
      budget.approval_threshold,
    );
    expect(check.allowed).toBe(false);
    expect(check.requiresApproval).toBe(true);
    expect(check.exceedsCeiling).toBe(false);
  });

  it('refuses outright above a category ceiling, approval or not', async () => {
    const { store, business } = await makeProductionWorkspace();
    const budget = await getBudget(store, OWNER_ID, business.id);
    const check = await checkSpend(
      store,
      OWNER_ID,
      business.id,
      null,
      'image',
      budget.max_image_spend + 1,
    );
    expect(check.exceedsCeiling).toBe(true);
    expect(check.requiresApproval).toBe(false);
  });

  it('allows spend below the threshold', async () => {
    const { store, business } = await makeProductionWorkspace();
    const check = await checkSpend(store, OWNER_ID, business.id, null, 'image', 0.2);
    expect(check.allowed).toBe(true);
  });

  it('counts spend already attributed to the video', async () => {
    const { store, business } = await makeProductionWorkspace();
    await store.insert('financial_transactions', {
      id: 'txn-1',
      owner_id: OWNER_ID,
      business_id: business.id,
      kind: 'ai_cost',
      category: 'image',
      description: 'test',
      amount: 3.5,
      currency: 'GBP',
      occurred_at: new Date().toISOString(),
      reference_type: 'video',
      reference_id: 'video-1',
      is_demo: false,
      created_at: new Date().toISOString(),
    });
    expect(await videoSpend(store, OWNER_ID, 'video-1')).toBe(3.5);
  });
});

describe('spend approval', () => {
  it('re-queues the task with spending authorised rather than completing it', async () => {
    const { store, business, agents } = await makeProductionWorkspace();
    const timestamp = new Date().toISOString();
    await store.insert('tasks', {
      id: 'task-spend',
      owner_id: OWNER_ID,
      mission_id: null,
      business_id: business.id,
      agent_id: agents.assetAgent.id,
      step_key: 'assets',
      title: 'Source assets',
      description: '',
      status: 'approval',
      priority: 'normal',
      input: { capability: 'youtube.asset_generate' },
      output: null,
      error: null,
      progress: 100,
      is_demo: false,
      created_at: timestamp,
      started_at: timestamp,
      completed_at: null,
      due_at: null,
    });
    await store.insert('approvals', {
      id: 'approval-spend',
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: 'task-spend',
      agent_id: agents.assetAgent.id,
      kind: 'spend',
      title: 'Approve £8.00 for scene assets',
      summary: 'test',
      payload: { authorise_spend: true, estimate: 8 },
      status: 'pending',
      feedback: null,
      is_demo: false,
      created_at: timestamp,
      resolved_at: null,
    });

    await resolveApproval(store, OWNER_ID, 'approval-spend', 'approve');

    const task = await store.get('tasks', 'task-spend');
    expect(task!.status).toBe('queued');
    expect(task!.input.spend_authorised).toBe(true);
  });

  it('cancels the step when spending is refused', async () => {
    const { store, business, agents } = await makeProductionWorkspace();
    const timestamp = new Date().toISOString();
    await store.insert('tasks', {
      id: 'task-spend-2',
      owner_id: OWNER_ID,
      mission_id: null,
      business_id: business.id,
      agent_id: agents.assetAgent.id,
      step_key: 'assets',
      title: 'Source assets',
      description: '',
      status: 'approval',
      priority: 'normal',
      input: {},
      output: null,
      error: null,
      progress: 100,
      is_demo: false,
      created_at: timestamp,
      started_at: timestamp,
      completed_at: null,
      due_at: null,
    });
    await store.insert('approvals', {
      id: 'approval-spend-2',
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: 'task-spend-2',
      agent_id: agents.assetAgent.id,
      kind: 'spend',
      title: 'Approve £8.00',
      summary: 'test',
      payload: { authorise_spend: true },
      status: 'pending',
      feedback: null,
      is_demo: false,
      created_at: timestamp,
      resolved_at: null,
    });

    await resolveApproval(store, OWNER_ID, 'approval-spend-2', 'reject', 'Too expensive.');
    const task = await store.get('tasks', 'task-spend-2');
    expect(task!.status).toBe('cancelled');
  });
});

describe('captions', () => {
  it('produces cues that stay inside the segment they came from', () => {
    const cues = buildCues([
      { text: 'One sentence. Then a second sentence follows it.', start: 0, duration: 10 },
    ]);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.start).toBeGreaterThanOrEqual(0);
    expect(cues.at(-1)!.end).toBeLessThanOrEqual(10.5);
  });

  it('never emits an empty cue', () => {
    const cues = buildCues([{ text: 'Short.', start: 2, duration: 3 }]);
    for (const cue of cues) expect(cue.text.trim().length).toBeGreaterThan(0);
  });

  it('writes valid SRT and WebVTT', () => {
    const cues = buildCues([{ text: 'Hello there. This is narration.', start: 0, duration: 6 }]);
    const srt = toSrt(cues);
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    const vtt = toVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('-->');
  });
});

describe('agent execution engine', () => {
  it('routes a provider-mode capability through the same engine', async () => {
    const { store, business, agents } = await makeProductionWorkspace();
    const timestamp = new Date().toISOString();
    await store.insert('tasks', {
      id: 'task-provider',
      owner_id: OWNER_ID,
      mission_id: null,
      business_id: business.id,
      agent_id: agents.voiceover.id,
      step_key: null,
      title: 'Generate narration',
      description: '',
      status: 'queued',
      priority: 'normal',
      input: { capability: 'youtube.voiceover.generate' },
      output: null,
      error: null,
      progress: 0,
      is_demo: false,
      created_at: timestamp,
      started_at: null,
      completed_at: null,
      due_at: null,
    });

    const result = await runAgent(store, OWNER_ID, 'task-provider');

    // No narration plan exists, so it blocks — the point is that it went
    // through the engine and produced activity, not that it succeeded.
    expect(result.blocked).toBeTruthy();
    const activity = await store.list('activity_logs');
    expect(activity.some((a) => a.kind === 'agent_started')).toBe(true);
    expect(activity.some((a) => a.kind === 'blocked')).toBe(true);
  });
});
