import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { findWorkflow, WORKFLOW_DEFINITIONS } from '@/lib/workflows/definitions';
import { getCapabilityHandler } from '@/lib/agents/capabilities';
import { makeProductionWorkspace, OWNER_ID } from './helpers';

/**
 * The core principle, asserted rather than asserted-to.
 *
 * There is **one** workflow. Demo Mode and Production Mode build the identical
 * task graph — same steps, same order, same dependencies, same approval gates,
 * same capabilities — and differ only in which implementation answers each
 * provider call.
 *
 * That is easy to say and easy to lose. The moment someone adds
 * `if (isDemoMode())` to a workflow definition or a capability list, the demo
 * stops testing the thing it is demonstrating and starts being a parallel
 * product that happens to look similar. These tests make that regression fail
 * loudly.
 */

function clearEnv() {
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'ANTHROPIC_API_KEY',
    'COMMAND_CENTRE_MODE',
    'DISABLE_SIMULATED_MEDIA',
    'VOICE_PROVIDER',
    'VOICE_PROVIDER_API_KEY',
    'IMAGE_PROVIDER',
    'IMAGE_PROVIDER_API_KEY',
    'MUSIC_PROVIDER',
    'MUSIC_PROVIDER_API_KEY',
    'SUBTITLE_PROVIDER',
    'SUBTITLE_PROVIDER_API_KEY',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REFRESH_TOKEN',
  ]) {
    vi.stubEnv(key, '');
  }
}

beforeEach(clearEnv);

/** The task graph a mission produces, reduced to what must not vary by mode. */
interface Graph {
  steps: {
    key: string;
    capability: string;
    title: string;
    requiresApproval: boolean;
    dependsOn: string[];
  }[];
}

async function buildGraph(workflowKey: string): Promise<Graph> {
  const { store, business } = await makeProductionWorkspace();
  const { mission, tasks } = await createMission(store, {
    ownerId: OWNER_ID,
    businessId: business.id,
    title: 'Graph under test',
    objective: 'Compare modes',
    workflowKey,
  });

  const dependencies = await store.list('task_dependencies');
  const byId = new Map(tasks.map((task) => [task.id, task]));

  return {
    steps: tasks.map((task) => ({
      key: task.step_key ?? task.id,
      capability: String(task.input.capability ?? ''),
      title: task.title,
      requiresApproval: task.input.requires_approval === true,
      dependsOn: dependencies
        .filter((dependency) => dependency.task_id === task.id)
        .map((dependency) => byId.get(dependency.depends_on_task_id)?.step_key ?? '?')
        .sort(),
    })),
  };
}

/* ------------------------------------------------------------------ */

describe('one workflow, two modes', () => {
  it('builds an identical task graph in demo and in production', async () => {
    // Demo: no database, so nothing real is reachable.
    clearEnv();
    const { currentMode: demoMode } = await import('@/lib/modes');
    expect(demoMode()).toBe('demo');
    const demo = await buildGraph('youtube_video_full');

    // Production: database and model configured.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const { currentMode: prodMode } = await import('@/lib/modes');
    expect(prodMode()).toBe('production');
    const production = await buildGraph('youtube_video_full');

    // The whole principle, in one assertion.
    expect(production).toEqual(demo);
  });

  it('runs every stage the studio claims, in dependency order', async () => {
    const graph = await buildGraph('youtube_video_full');
    const keys = graph.steps.map((step) => step.key);

    for (const stage of [
      'research',
      'script',
      'fact_check',
      'voiceover_plan',
      'voiceover',
      'visual_plan',
      'assets',
      'thumbnail_concepts',
      'thumbnail_images',
      'metadata',
      'assembly',
      'subtitles',
      'copyright',
      'quality_check',
      'publish',
      'analytics',
    ]) {
      expect(keys, `the pipeline must include ${stage}`).toContain(stage);
    }

    const position = (key: string) => keys.indexOf(key);
    for (const step of graph.steps) {
      for (const dependency of step.dependsOn) {
        // A step can never be planned before something it depends on.
        expect(position(dependency)).toBeLessThan(position(step.key));
      }
    }

    // Publishing is the last thing before measuring, and it waits on QC.
    expect(graph.steps.find((step) => step.key === 'publish')!.dependsOn).toEqual([
      'quality_check',
    ]);
    expect(graph.steps.find((step) => step.key === 'analytics')!.dependsOn).toEqual(['publish']);
  });

  it('gates the script in every mode, not just in production', async () => {
    clearEnv();
    const demo = await buildGraph('youtube_video_full');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    const production = await buildGraph('youtube_video_full');

    const gates = (graph: Graph) =>
      graph.steps.filter((step) => step.requiresApproval).map((step) => step.key);

    expect(gates(demo)).toEqual(['fact_check']);
    expect(gates(production)).toEqual(gates(demo));
  });

  it('has exactly one definition per workflow key — no demo variants', () => {
    const keys = WORKFLOW_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The names that would betray a forked pipeline.
    for (const key of keys) {
      expect(key).not.toMatch(/demo|simulated|mock|_v2$|production_/i);
    }
  });

  it('resolves every capability the pipeline names to a real handler', () => {
    for (const definition of WORKFLOW_DEFINITIONS) {
      for (const step of definition.steps) {
        expect(
          getCapabilityHandler(step.capability),
          `${definition.key} → ${step.capability} has no handler`,
        ).toBeTruthy();
      }
    }
  });
});

/* ------------------------------------------------------------------ */

describe('only the providers differ', () => {
  it('simulates in demo and development, never in production', async () => {
    clearEnv();
    let modes = await import('@/lib/modes');
    expect(modes.simulationAllowed('demo')).toBe(true);
    expect(modes.simulationAllowed('development')).toBe(true);
    expect(modes.simulationAllowed('production')).toBe(false);

    // And the opt-out holds even in demo, so a test run can prove the
    // "not connected" path rather than the placeholder path.
    vi.stubEnv('DISABLE_SIMULATED_MEDIA', 'true');
    modes = await import('@/lib/modes');
    expect(modes.simulationAllowed('demo')).toBe(false);
  });

  it('refuses to call a real workspace a demo', async () => {
    clearEnv();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('COMMAND_CENTRE_MODE', 'demo');

    const { currentMode } = await import('@/lib/modes');
    // Demo means "no database". Honouring the override here would put
    // simulated output into real records.
    expect(currentMode()).toBe('development');
  });

  it('hands back a simulated provider in demo and a refusing one in production', async () => {
    vi.resetModules();
    clearEnv();
    const demo = await import('@/lib/integrations/providers/registry');
    for (const descriptor of demo.describeMediaProviders()) {
      if (descriptor.kind === 'renderer') continue; // local compute, always real
      expect(descriptor.simulated, `${descriptor.kind} should be simulated in demo`).toBe(true);
      expect(descriptor.connected).toBe(true);
    }

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    const production = await import('@/lib/integrations/providers/registry');
    for (const descriptor of production.describeMediaProviders()) {
      if (descriptor.kind === 'renderer') continue;
      // Nothing is simulated and nothing pretends to be connected. A step that
      // needs one of these blocks with the variables required to fix it.
      expect(descriptor.simulated, `${descriptor.kind} must not simulate in production`).toBe(
        false,
      );
      expect(descriptor.connected).toBe(false);
      expect(descriptor.requiredEnv.length).toBeGreaterThan(0);
    }
    vi.resetModules();
  });

  it('covers every provider the studio pipeline calls', async () => {
    vi.resetModules();
    clearEnv();
    const { describeMediaProviders } = await import('@/lib/integrations/providers/registry');
    const kinds = describeMediaProviders().map((descriptor) => descriptor.kind);

    for (const kind of [
      'voice',
      'music',
      'image',
      'video',
      'stock',
      'subtitles',
      'renderer',
      'publisher',
      'analytics',
    ]) {
      expect(kinds).toContain(kind);
    }
    vi.resetModules();
  });

  it('never invents analytics, even in demo', async () => {
    const { SimulatedAnalyticsProvider } = await import(
      '@/lib/integrations/providers/studio-simulated'
    );
    const days = await new SimulatedAnalyticsProvider().collectAnalytics({
      externalId: 'anything',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    // Fabricated view counts would flow into Business Intelligence Memory and
    // from there into every future prompt. Nobody watched anything in a demo.
    expect(days).toEqual([]);
  });

  it('never returns a plausible platform id from a simulated upload', async () => {
    const { SimulatedPublisher } = await import(
      '@/lib/integrations/providers/studio-simulated'
    );
    const result = await new SimulatedPublisher().publish({
      videoPath: '/tmp/x.mp4',
      thumbnailPath: null,
      captionsVtt: null,
      title: 'x',
      description: '',
      tags: [],
      chapters: [],
      visibility: 'private',
      publishAt: null,
      madeForKids: false,
      syntheticMedia: true,
    });
    expect(result.simulated).toBe(true);
    expect(result.externalId).toMatch(/^simulated-/);
    expect(result.url).not.toMatch(/youtube\.com/);
  });
});

/* ------------------------------------------------------------------ */

describe('the workflow library itself', () => {
  it('exposes the full pipeline under one stable key', () => {
    const workflow = findWorkflow('youtube_video_full');
    expect(workflow).toBeTruthy();
    expect(workflow!.steps.length).toBeGreaterThanOrEqual(16);
  });

  it('names no provider anywhere in a workflow definition', () => {
    // A workflow that mentions ElevenLabs or a simulated provider has bound
    // itself to an implementation, which is the coupling this whole design
    // exists to prevent.
    const text = JSON.stringify(WORKFLOW_DEFINITIONS).toLowerCase();
    for (const forbidden of ['elevenlabs', 'openai', 'flux', 'remotion', 'simulated']) {
      expect(text, `workflows must not name ${forbidden}`).not.toContain(forbidden);
    }
    // Word-boundary check for "mock": a mock *provider* must never be named,
    // but "mockup" — a genuine Etsy listing image — is a different word and
    // must not be flagged just for containing the same four letters.
    expect(text, 'workflows must not name a mock provider').not.toMatch(/\bmock\b/);
  });
});
