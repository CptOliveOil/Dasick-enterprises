import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDossier } from '@/lib/approvals/dossier';
import { buildDiffs, categoriseFinding, diffSections, locate } from '@/lib/approvals/dossier/script';
import { diffWords, tokenise } from '@/lib/approvals/diff';
import { scoreScript } from '@/lib/approvals/quality';
import { classifySource, groupSources, publisherName } from '@/lib/approvals/sources';
import { buildScenes, suggestVisuals } from '@/lib/approvals/scenes';
import { composeChangeRequest, presetsFor } from '@/lib/approvals/presets';
import { buildDocx, crc32, documentXml, escapeXml, slug, zip } from '@/lib/approvals/export';
import { resolveApproval } from '@/lib/workflows/approvals';
import { uuid } from '@/lib/ids';
import { makeWorkspace, OWNER_ID } from './helpers';
import type { Approval, ScriptSection } from '@/types/domain';
import type {
  ClaimsPanel,
  DocumentPanel,
  Panel,
  ScenesPanel,
  ScoresPanel,
  SourcesPanel,
  VersionsPanel,
} from '@/lib/approvals/dossier/types';

/**
 * The rule under test, in one sentence: **an operator is never asked to approve
 * work they cannot fully inspect.**
 *
 * The bug that prompted all of this shipped a script approval showing "1 claim
 * checked, 1 warning" above a button that starts production and opens a budget.
 * These tests are about the properties that stop that recurring — the work is
 * shown in full, every warning carries its reason, nothing is scored that was
 * not measured, and an approval kind nobody has written code for still gets a
 * complete review.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SECTIONS: ScriptSection[] = [
  {
    kind: 'hook',
    heading: 'The missing Porygon episode',
    body: 'Why did an episode disappear from every broadcast schedule in 1997? Nobody at the network would say. The tape existed, the episode aired once, and then it was gone.',
  },
  {
    kind: 'introduction',
    heading: 'What actually happened',
    body: 'On 16 December 1997 a Japanese broadcast reached roughly 4.6 million households. Within hours, ambulances were called across the country. The reaction was traced to a strobing sequence.',
  },
  {
    kind: 'main',
    heading: 'The aftermath',
    body: 'Broadcasters compared the incident to earlier cases and revised their guidance. The process by which animation is now checked for photosensitivity begins here, and it explains why the industry changed.',
  },
  {
    kind: 'payoff',
    heading: 'Why it still matters',
    body: 'The episode has never been rebroadcast. That single decision is why a generation knows the name and has never seen the thing itself.',
  },
];

async function scriptWorkspace(options: {
  findings?: { claim: string; verdict: string; reasoning: string; correction?: string | null }[];
  sections?: ScriptSection[];
  withResearch?: boolean;
  versions?: number;
} = {}) {
  const { store, business, agents } = await makeWorkspace();
  const timestamp = new Date().toISOString();
  const sections = options.sections ?? SECTIONS;

  const mission = {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    parent_mission_id: null,
    number: 3,
    title: 'The Porygon documentary',
    objective: 'Produce one full video',
    status: 'running' as const,
    priority: 'normal' as const,
    target_date: null,
    target_time: null,
    workflow_definition_id: null,
    context: {},
    progress: 40,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
  };
  await store.insert('missions', mission);

  const task = {
    id: uuid(),
    owner_id: OWNER_ID,
    mission_id: mission.id,
    business_id: business.id,
    agent_id: agents.checker.id,
    step_key: 'factcheck',
    title: 'Fact check the script',
    description: '',
    status: 'approval' as const,
    priority: 'normal' as const,
    input: { capability: 'youtube.script.factcheck' },
    output: null,
    error: null,
    progress: 100,
    is_demo: false,
    created_at: timestamp,
    started_at: timestamp,
    completed_at: null,
    due_at: null,
  };
  await store.insert('tasks', task);

  await store.insert('api_usage', {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    agent_id: agents.writer.id,
    task_id: task.id,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    input_tokens: 4000,
    output_tokens: 3000,
    estimated_cost: 0.12,
    duration_ms: 42_000,
    is_demo: false,
    created_at: timestamp,
  });

  let researchId: string | null = null;
  if (options.withResearch !== false) {
    researchId = uuid();
    await store.insert('youtube_research', {
      id: researchId,
      business_id: business.id,
      idea_id: null,
      task_id: null,
      overview: 'Research package',
      facts: [
        {
          claim: 'The episode aired once on 16 December 1997.',
          detail: '',
          confidence: 'verified',
          source: 'https://en.wikipedia.org/wiki/Dennō_Senshi_Porygon',
        },
        {
          claim: 'Roughly 4.6 million households were watching.',
          detail: '',
          confidence: 'needs_verification',
          source: 'https://www.bbc.co.uk/news/example',
        },
        {
          claim: 'Broadcast guidance was revised afterwards.',
          detail: '',
          confidence: 'needs_verification',
          source: null,
        },
      ],
      statistics: [],
      timeline: [],
      viewer_questions: [],
      competitor_coverage: [],
      content_gaps: [],
      hooks: [],
      interesting_details: [],
      risks: [],
      uncertain_claims: [],
      is_demo: false,
      created_at: timestamp,
    });
  }

  const scriptId = uuid();
  const wordCount = sections.reduce(
    (total, section) => total + section.body.trim().split(/\s+/).length,
    0,
  );
  await store.insert('youtube_scripts', {
    id: scriptId,
    business_id: business.id,
    idea_id: null,
    research_id: researchId,
    task_id: null,
    title: 'The episode that vanished',
    sections,
    word_count: wordCount,
    estimated_duration_seconds: Math.round((wordCount / 155) * 60),
    tone: 'documentary',
    audience: 'curious adults',
    goal: 'explain the incident',
    status: 'awaiting_approval',
    version: options.versions ?? 1,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
  });

  for (let version = 1; version <= (options.versions ?? 1); version += 1) {
    await store.insert('youtube_script_versions', {
      id: uuid(),
      script_id: scriptId,
      version,
      sections:
        version === 1
          ? sections
          : sections.map((section, index) =>
              index === 0 ? { ...section, body: `${section.body} And nobody has explained it since.` } : section,
            ),
      note: version === 1 ? 'First draft' : 'Rewrite the opening',
      created_at: new Date(Date.parse(timestamp) + version * 1000).toISOString(),
    });
  }

  const findings = options.findings ?? [
    {
      claim: 'The episode aired once on 16 December 1997.',
      verdict: 'verified',
      reasoning: 'Confirmed according to Wikipedia and contemporary reporting.',
    },
    {
      claim: 'Roughly 4.6 million households were watching.',
      verdict: 'needs_review',
      reasoning: 'Figures are disputed between contemporary accounts; historians give a range.',
      correction: 'Say "millions of households" rather than a precise figure.',
    },
  ];

  const factCheckId = uuid();
  await store.insert('youtube_fact_checks', {
    id: factCheckId,
    business_id: business.id,
    script_id: scriptId,
    task_id: task.id,
    findings: findings.map((finding) => ({
      claim: finding.claim,
      verdict: finding.verdict as never,
      reasoning: finding.reasoning,
      suggested_correction: finding.correction ?? null,
    })),
    passed: findings.every((f) => f.verdict !== 'potentially_incorrect'),
    summary: `${findings.length} claims checked.`,
    is_demo: false,
    created_at: timestamp,
  });

  const approval: Approval = {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    mission_id: mission.id,
    task_id: task.id,
    agent_id: agents.checker.id,
    kind: 'script',
    title: 'Approve the script',
    summary: `${findings.length} claims checked, 1 warning`,
    payload: { script_id: scriptId, fact_check_id: factCheckId, word_count: wordCount },
    status: 'pending',
    feedback: null,
    resolved_at: null,
    is_demo: false,
    created_at: timestamp,
  };
  await store.insert('approvals', approval);

  return { store, business, agents, approval, scriptId, mission, task };
}

function panel<T extends Panel['kind']>(panels: Panel[], kind: T) {
  const found = panels.find((entry) => entry.kind === kind);
  expect(found, `expected a ${kind} panel`).toBeTruthy();
  return found as Extract<Panel, { kind: T }>;
}

/* ------------------------------------------------------------------ */

describe('the script dossier', () => {
  it('shows the whole script, not a summary of it', async () => {
    const { store, approval } = await scriptWorkspace();
    const dossier = await buildDossier(store, OWNER_ID, approval);

    const document = panel(dossier.panels, 'document') as DocumentPanel;
    expect(document.blocks).toHaveLength(SECTIONS.length);
    for (const [index, section] of SECTIONS.entries()) {
      // The full body, character for character. A truncated preview is the same
      // failure as a summary.
      expect(document.blocks[index]!.body).toBe(section.body);
      expect(document.blocks[index]!.heading).toBe(section.heading);
    }
    expect(document.blocks[0]!.label).toBe('Cold open');
  });

  it('puts every figure the operator was promised in the summary', async () => {
    const { store, approval } = await scriptWorkspace();
    const dossier = await buildDossier(store, OWNER_ID, approval);
    const labels = dossier.summary.metrics.map((metric) => metric.label);

    for (const expected of [
      'Runtime',
      'Word count',
      'Reading time',
      'Sources',
      'Verified claims',
      'Needs manual review',
      'Confidence',
      'AI cost',
      'Generation time',
      'Last edited',
    ]) {
      expect(labels).toContain(expected);
    }

    // Provenance, so the operator knows whose work this is.
    const attribution = dossier.summary.attribution.map((entry) => entry.label);
    expect(attribution).toContain('Business');
    expect(attribution).toContain('Mission');
    expect(attribution).toContain('Agent');

    expect(dossier.summary.metrics.find((m) => m.label === 'AI cost')?.value).toBe('£0.12');
  });

  it('separates verified claims from warnings and explains every one', async () => {
    const { store, approval } = await scriptWorkspace();
    const dossier = await buildDossier(store, OWNER_ID, approval);
    const claims = panel(dossier.panels, 'claims') as ClaimsPanel;

    expect(claims.verified).toHaveLength(1);
    expect(claims.warnings).toHaveLength(1);

    // The property that matters: a warning with no reason cannot be acted on.
    for (const claim of [...claims.verified, ...claims.warnings]) {
      expect(claim.why.trim().length).toBeGreaterThan(0);
      expect(claim.category.trim().length).toBeGreaterThan(0);
    }
    expect(claims.warnings[0]!.correction).toContain('millions of households');
    expect(claims.warnings[0]!.location).toBe('What actually happened');
  });

  it('never leaves a warning unexplained, even when the model wrote no reasoning', async () => {
    const { store, approval } = await scriptWorkspace({
      findings: [{ claim: 'Something asserted.', verdict: 'unsourced', reasoning: '   ' }],
    });
    const claims = panel(
      (await buildDossier(store, OWNER_ID, approval)).panels,
      'claims',
    ) as ClaimsPanel;

    expect(claims.warnings[0]!.why).toMatch(/no reasoning/i);
  });

  it('groups sources by what kind of evidence they are', async () => {
    const { store, approval } = await scriptWorkspace();
    const sources = panel(
      (await buildDossier(store, OWNER_ID, approval)).panels,
      'sources',
    ) as SourcesPanel;

    const names = sources.groups.map((group) => group.name);
    expect(names).toContain('Encyclopedias');
    expect(names).toContain('News and journalism');
    // A claim with no source is itself a finding, so it is shown rather than
    // dropped.
    expect(names).toContain('Uncited');
    // Strongest evidence first, uncited last.
    expect(names[names.length - 1]).toBe('Uncited');

    for (const group of sources.groups) {
      expect(group.reliability.trim().length).toBeGreaterThan(0);
      for (const source of group.sources) {
        expect(source.citations).toBeGreaterThan(0);
      }
    }
  });

  it('scores what it can measure and refuses to score what it cannot', async () => {
    const { store, approval } = await scriptWorkspace();
    const scores = panel(
      (await buildDossier(store, OWNER_ID, approval)).panels,
      'scores',
    ) as ScoresPanel;

    const byLabel = new Map(scores.scores.map((score) => [score.label, score]));
    for (const label of [
      'Hook strength',
      'Retention prediction',
      'Narrative pacing',
      'Story clarity',
      'Source diversity',
      'Fact confidence',
      'Originality',
      'Evergreen score',
      'SEO quality',
      'Visual opportunity',
    ]) {
      expect(byLabel.has(label)).toBe(true);
      // Every score states what it measured, measurable or not.
      expect(byLabel.get(label)!.basis.trim().length).toBeGreaterThan(0);
    }

    // Nothing to compare against and nothing written yet: unknown, not invented.
    expect(byLabel.get('Originality')!.value).toBeNull();
    expect(byLabel.get('SEO quality')!.value).toBeNull();
    expect(byLabel.get('Fact confidence')!.value).not.toBeNull();

    // The overall figure excludes what could not be measured rather than
    // treating it as zero or as full marks.
    expect(scores.overall!.basis).toMatch(/excluded rather than assumed/);
  });

  it('breaks the narration into scenes with visual suggestions', async () => {
    const { store, approval } = await scriptWorkspace();
    const scenes = panel(
      (await buildDossier(store, OWNER_ID, approval)).panels,
      'scenes',
    ) as ScenesPanel;

    expect(scenes.scenes.length).toBeGreaterThanOrEqual(SECTIONS.length);
    expect(scenes.scenes[0]!.number).toBe(1);
    for (const scene of scenes.scenes) {
      expect(scene.visuals.length).toBeGreaterThan(0);
      expect(scene.seconds).toBeGreaterThan(0);
    }
    // The 1997 date should ask for archive material.
    expect(scenes.scenes.some((scene) => scene.visuals.some((v) => v.kind === 'Archive footage'))).toBe(
      true,
    );
    expect(scenes.note).toMatch(/No footage has been sourced/);
  });

  it('carries the version history and a word-level diff', async () => {
    const { store, approval } = await scriptWorkspace({ versions: 2 });
    const versions = panel(
      (await buildDossier(store, OWNER_ID, approval)).panels,
      'versions',
    ) as VersionsPanel;

    expect(versions.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.diffs).toHaveLength(1);

    const changed = versions.diffs[0]!.sections.filter((s) => s.status === 'modified');
    expect(changed).toHaveLength(1);
    expect(changed[0]!.after.some((token) => token.change === 'add')).toBe(true);
    expect(versions.history[0]!.decision).toBe('Sent for review');
  });

  it('offers the script for copy and download as Markdown', async () => {
    const { store, approval } = await scriptWorkspace();
    const dossier = await buildDossier(store, OWNER_ID, approval);

    expect(dossier.document).not.toBeNull();
    expect(dossier.document!.markdown).toContain('# The episode that vanished');
    for (const section of SECTIONS) {
      expect(dossier.document!.markdown).toContain(section.body);
    }
  });

  it('says plainly when nothing has been fact checked', async () => {
    const { store, business, approval } = await scriptWorkspace();
    for (const check of await store.list('youtube_fact_checks', {
      where: { business_id: business.id },
    })) {
      await store.remove('youtube_fact_checks', check.id);
    }

    const dossier = await buildDossier(store, OWNER_ID, approval);
    expect(dossier.summary.notice).toMatch(/has been fact checked/i);
    const claims = panel(dossier.panels, 'claims') as ClaimsPanel;
    expect(claims.note).toMatch(/No fact check/);
  });

  it('spells out that approving starts spending', async () => {
    const { store, approval } = await scriptWorkspace();
    const dossier = await buildDossier(store, OWNER_ID, approval);
    expect(dossier.actions.approve.consequence).toMatch(/spend real money/i);
    expect(dossier.actions.requestChanges.presets.length).toBeGreaterThan(8);
  });
});

/* ------------------------------------------------------------------ */

describe('the generic fallback', () => {
  it('gives a kind nobody has written code for a complete review', async () => {
    const { store } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: null,
      mission_id: null,
      task_id: null,
      agent_id: null,
      // A kind with no builder, no resolver and no payload id.
      kind: 'generic',
      title: 'A brand new sort of decision',
      summary: 'Something a business added next year wants signed off.',
      payload: {
        proposals: [
          { title: 'Open a second storefront', rationale: 'Demand exceeds one channel.' },
          { title: 'Hold', rationale: 'Cash is tight.' },
        ],
      },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const dossier = await buildDossier(store, OWNER_ID, approval);
    const items = panel(dossier.panels, 'items');
    expect(items.items).toHaveLength(2);
    expect(items.items[0]!.title).toBe('Open a second storefront');
    // Actions exist for every kind, with consequences spelled out.
    expect(dossier.actions.approve.consequence.length).toBeGreaterThan(0);
    expect(dossier.actions.requestChanges.presets.length).toBeGreaterThan(0);
  });

  it('flags an approval that carries nothing to inspect instead of showing a blank panel', async () => {
    const { store } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: null,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'generic',
      title: 'Empty',
      summary: '',
      payload: {},
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const dossier = await buildDossier(store, OWNER_ID, approval);
    expect(dossier.source).toBe('none');
    expect(panel(dossier.panels, 'fields').note).toMatch(/decision made blind/i);
  });

  it('shows the money behind a spend gate', async () => {
    const { store, business } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'spend',
      title: 'Authorise £0.14',
      summary: 'Narration for the Porygon documentary.',
      payload: { estimate: 0.14, authorise_spend: true, model: 'claude-sonnet-4-5' },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const dossier = await buildDossier(store, OWNER_ID, approval);
    const ledger = panel(dossier.panels, 'ledger');
    const labels = ledger.lines.map((line) => line.label);
    expect(labels).toContain('This step would spend');
    expect(labels).toContain('This mission so far');
    expect(labels).toContain('Monthly ceiling');
    expect(dossier.actions.approve.consequence).toMatch(/ceilings are unchanged/i);
  });
});

/* ------------------------------------------------------------------ */

describe('request changes', () => {
  it('sends the work back to the agent that can actually redo it', async () => {
    const { store, approval, agents, task, mission } = await scriptWorkspace();

    await resolveApproval(
      store,
      OWNER_ID,
      approval.id,
      'request_changes',
      'Rewrite the opening. Reduce the runtime.',
    );

    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    const rework = tasks.find((entry) => entry.input.capability === 'youtube.script.revise');

    expect(rework, 'a revision task should have been queued').toBeTruthy();
    // The Scriptwriter, not the Fact Checker.
    expect(rework!.agent_id).toBe(agents.writer.id);
    expect(rework!.status).toBe('queued');
    expect(rework!.input.instruction).toContain('Rewrite the opening');
    expect(rework!.input.operator_feedback).toContain('Rewrite the opening');

    // The step that raised the approval waits for the rewrite rather than
    // re-checking the draft it just rejected.
    const original = tasks.find((entry) => entry.id === task.id)!;
    expect(original.status).toBe('waiting');
    const dependencies = await store.list('task_dependencies', { where: { task_id: task.id } });
    expect(dependencies.map((d) => d.depends_on_task_id)).toContain(rework!.id);
  });

  it('falls back to re-queueing the same step when nobody can do the rework', async () => {
    const { store, approval, agents, task, mission } = await scriptWorkspace();
    // Take the revise capability away from the only agent that has it.
    await store.update('agents', agents.writer.id, { capabilities: [] });

    await resolveApproval(store, OWNER_ID, approval.id, 'request_changes', 'Try again.');

    const tasks = await store.list('tasks', { where: { mission_id: mission.id } });
    expect(tasks.some((entry) => entry.input.capability === 'youtube.script.revise')).toBe(false);

    const original = tasks.find((entry) => entry.id === task.id)!;
    expect(original.status).toBe('queued');
    expect(original.input.operator_feedback).toBe('Try again.');
  });

  it('leaves approve and reject exactly as they were', async () => {
    const approved = await scriptWorkspace();
    await resolveApproval(store_(approved), OWNER_ID, approved.approval.id, 'approve');
    const approvedTask = await approved.store.get('tasks', approved.task.id);
    expect(approvedTask!.status).toBe('completed');
    expect(
      (await approved.store.list('tasks', { where: { mission_id: approved.mission.id } })).some(
        (t) => t.input.capability === 'youtube.script.revise',
      ),
    ).toBe(false);

    const rejected = await scriptWorkspace();
    await resolveApproval(rejected.store, OWNER_ID, rejected.approval.id, 'reject', 'No.');
    const rejectedTask = await rejected.store.get('tasks', rejected.task.id);
    expect(rejectedTask!.status).toBe('cancelled');
  });
});

const store_ = (workspace: { store: Awaited<ReturnType<typeof makeWorkspace>>['store'] }) =>
  workspace.store;

/* ------------------------------------------------------------------ */

describe('change presets', () => {
  it('offers the notes an editor actually gives', () => {
    const labels = presetsFor('script').map((preset) => preset.label.toLowerCase());
    for (const expected of [
      'rewrite the opening',
      'more dramatic',
      'simplify the language',
      'add humour',
      'increase suspense',
      'target a younger audience',
      'reduce the runtime',
      'increase the runtime',
      'more citations',
      'reduce repetition',
      'rewrite the ending',
      'improve the pacing',
      'stronger call to action',
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it('gives an unknown kind sensible defaults rather than an empty box', () => {
    expect(presetsFor('generic').length).toBeGreaterThan(0);
  });

  it('composes several selections and a custom note into one numbered brief', () => {
    const brief = composeChangeRequest(['Do A.', 'Do B.'], 'And keep the ending.');
    expect(brief).toContain('1. Do A.');
    expect(brief).toContain('2. Do B.');
    expect(brief).toContain("In the operator's own words: And keep the ending.");
  });

  it('passes a single instruction through unchanged', () => {
    expect(composeChangeRequest(['Just this.'])).toBe('Just this.');
    expect(composeChangeRequest([], 'Only my words.')).toBe('Only my words.');
    expect(composeChangeRequest([])).toBe('');
  });
});

/* ------------------------------------------------------------------ */

describe('the word diff', () => {
  it('marks additions and removals and leaves the rest alone', () => {
    const diff = diffWords('the cat sat on the mat', 'the cat sat on the warm mat');
    expect(diff.after.filter((token) => token.change === 'add').map((t) => t.text.trim())).toEqual([
      'warm',
    ]);
    expect(diff.before.every((token) => token.change !== 'add')).toBe(true);
    expect(diff.ratio).toBeGreaterThan(0);
  });

  it('reports identical text as unchanged', () => {
    const diff = diffWords('one two three', 'one two three');
    expect(diff.ratio).toBe(0);
    expect(diff.after.every((token) => token.change === 'same')).toBe(true);
  });

  it('rebuilds the original text exactly from its tokens', () => {
    const text = 'A sentence.  With   odd spacing.\nAnd a new line.';
    expect(tokenise(text).join('')).toBe(text.replace(/^\s+/, ''));
    expect(diffWords('', text).after.map((t) => t.text).join('').trim()).toBe(text.trim());
  });

  it('treats a renamed section as a removal plus an addition', () => {
    const before: ScriptSection[] = [{ kind: 'main', heading: 'Old', body: 'Body.' }];
    const after: ScriptSection[] = [{ kind: 'main', heading: 'New', body: 'Body.' }];
    const sections = diffSections(before, after);
    expect(sections.map((s) => s.status).sort()).toEqual(['added', 'removed']);
  });

  it('produces one diff per consecutive pair, newest first', () => {
    const sections: ScriptSection[] = [{ kind: 'main', heading: 'H', body: 'a' }];
    const versions = [1, 2, 3].map((version) => ({
      id: uuid(),
      script_id: 'x',
      version,
      sections: [{ ...sections[0]!, body: 'a'.repeat(version) }],
      note: `v${version}`,
      created_at: new Date().toISOString(),
    }));
    const diffs = buildDiffs(versions);
    expect(diffs.map((d) => `${d.from}->${d.to}`)).toEqual(['2->3', '1->2']);
  });
});

/* ------------------------------------------------------------------ */

describe('claim categorisation', () => {
  const cases: [string, string, string][] = [
    ['Medical claim', 'Vitamin C cures the disease.', 'No clinical evidence for this treatment.'],
    ['Legal claim', 'The company was sued.', 'Court records are unclear.'],
    ['Copyright concern', 'The design uses the logo.', 'This is a trademark owned by another party.'],
    ['Possible bias', 'Critics say the change was cynical.', 'This is an opinion, not a fact.'],
    ['Historical uncertainty', 'The first recorded case was in 1890.', 'Historians give conflicting dates.'],
  ];

  for (const [expected, claim, reasoning] of cases) {
    it(`recognises a ${expected.toLowerCase()}`, () => {
      expect(
        categoriseFinding({
          claim,
          verdict: 'needs_review',
          reasoning,
          suggested_correction: null,
        }),
      ).toBe(expected);
    });
  }

  it('locates a claim in the section that contains it', () => {
    expect(locate('roughly 4.6 million households were watching', SECTIONS)).toBe(
      'What actually happened',
    );
    expect(locate('something about entirely unrelated submarines', SECTIONS)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('source classification', () => {
  it('describes what a publisher is rather than judging the claim', () => {
    expect(classifySource('https://en.wikipedia.org/wiki/X').group).toBe('Encyclopedias');
    expect(classifySource('https://bulbapedia.bulbagarden.net/wiki/X').group).toBe(
      'Community wikis and fan resources',
    );
    expect(classifySource('https://www.gov.uk/statistics').group).toBe(
      'Government and official statistics',
    );
    expect(classifySource('https://doi.org/10.1000/xyz').group).toBe('Academic and peer-reviewed');
    expect(classifySource('https://www.bbc.co.uk/news/x').group).toBe('News and journalism');
    expect(classifySource('An interview with the director').group).toBe(
      'Interviews and first-hand accounts',
    );
  });

  it('reads a publisher name out of a URL or a citation', () => {
    expect(publisherName('https://www.bbc.co.uk/news/x')).toBe('bbc.co.uk');
    expect(publisherName('The Guardian — 4 March 2019')).toBe('The Guardian');
  });

  it('counts repeat citations against one source rather than listing it twice', () => {
    const groups = groupSources([
      { source: 'https://en.wikipedia.org/wiki/A', claim: 'a', location: 'One' },
      { source: 'https://en.wikipedia.org/wiki/B', claim: 'b', location: 'Two' },
    ]);
    const encyclopedias = groups.find((group) => group.name === 'Encyclopedias')!;
    expect(encyclopedias.sources).toHaveLength(1);
    expect(encyclopedias.sources[0]!.citations).toBe(2);
    expect(encyclopedias.sources[0]!.usedIn).toEqual(['One', 'Two']);
  });
});

/* ------------------------------------------------------------------ */

describe('quality measures', () => {
  const base = {
    title: 'The episode that vanished',
    sections: SECTIONS,
    wordCount: 120,
    estimatedSeconds: 600,
    findings: [],
    research: null,
    metadata: null,
    priorTopics: [],
  };

  it('penalises a hook that opens with channel branding', () => {
    const branded = scoreScript({
      ...base,
      sections: [
        {
          kind: 'hook',
          heading: 'Intro',
          body: 'Welcome back to the channel. In this video we will look at an episode. Please subscribe.',
        },
        ...SECTIONS.slice(1),
      ],
    });
    const clean = scoreScript(base);
    const hookOf = (result: ReturnType<typeof scoreScript>) =>
      result.scores.find((score) => score.label === 'Hook strength')!.value!;
    expect(hookOf(branded)).toBeLessThan(hookOf(clean));
  });

  it('marks originality unknown until the business has history, then measures it', () => {
    expect(scoreScript(base).scores.find((s) => s.label === 'Originality')!.value).toBeNull();

    const repeat = scoreScript({
      ...base,
      priorTopics: ['The episode that vanished from every schedule'],
    });
    const score = repeat.scores.find((s) => s.label === 'Originality')!;
    expect(score.value).not.toBeNull();
    expect(score.value!).toBeLessThan(50);
    expect(score.basis).toMatch(/overlap/);
  });

  it('marks a script full of dated phrasing as less evergreen', () => {
    const dated = scoreScript({
      ...base,
      sections: [
        {
          kind: 'main',
          heading: 'Now',
          body: 'This year the company just announced a change. Currently the situation is unclear, and recently it changed again.',
        },
      ],
    });
    expect(dated.scores.find((s) => s.label === 'Evergreen score')!.value!).toBeLessThan(
      scoreScript(base).scores.find((s) => s.label === 'Evergreen score')!.value!,
    );
  });

  it('scores fact confidence from the verdicts and nothing else', () => {
    const perfect = scoreScript({
      ...base,
      findings: [
        { claim: 'a', verdict: 'verified', reasoning: '', suggested_correction: null },
        { claim: 'b', verdict: 'verified', reasoning: '', suggested_correction: null },
      ],
    });
    const poor = scoreScript({
      ...base,
      findings: [
        { claim: 'a', verdict: 'potentially_incorrect', reasoning: '', suggested_correction: null },
        { claim: 'b', verdict: 'unsourced', reasoning: '', suggested_correction: null },
      ],
    });
    expect(perfect.scores.find((s) => s.label === 'Fact confidence')!.value).toBe(100);
    expect(poor.scores.find((s) => s.label === 'Fact confidence')!.value!).toBeLessThan(20);
  });

  it('leaves the overall score unmeasurable when there is nothing to measure', () => {
    const empty = scoreScript({ ...base, sections: [], wordCount: 0, estimatedSeconds: 0 });
    expect(empty.overall!.value).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('scene suggestions', () => {
  it('splits a long section into scenes a cut could land on', () => {
    const long = 'Something happened in the year. '.repeat(40);
    const scenes = buildScenes([{ kind: 'main', heading: 'Long', body: long }]);
    expect(scenes.length).toBeGreaterThan(1);
    // Split at sentence ends, so no scene starts mid-sentence.
    for (const scene of scenes) expect(scene.narration.trim()).not.toMatch(/^[a-z]/);
  });

  it('says so when a beat has nothing concrete to cut to', () => {
    const visuals = suggestVisuals('It was a feeling that many people shared.');
    expect(visuals[0]!.kind).toBe('B-roll');
    expect(visuals[0]!.suggestion).toMatch(/wants rewriting/);
  });
});

/* ------------------------------------------------------------------ */

describe('export', () => {
  it('writes a zip a reader can open', () => {
    const bytes = zip([{ name: 'a.txt', content: 'hello' }]);
    // Local file header, then the central directory, then the end record.
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytes.length).toBeGreaterThan(60);
    const end = bytes.slice(bytes.length - 22);
    expect([...end.slice(0, 4)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    // One entry, recorded in both count fields.
    expect(end[8]).toBe(1);
    expect(end[10]).toBe(1);
  });

  it('computes the CRC32 the zip format expects', () => {
    // The known checksum of "123456789", the standard CRC-32 test vector.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('turns markdown into WordprocessingML with headings and paragraphs', () => {
    const xml = documentXml('# Title\n\nA paragraph.\n\n## Section\n\nAnother.');
    expect(xml).toContain('Heading1');
    expect(xml).toContain('Heading2');
    expect(xml).toContain('A paragraph.');
    expect(xml).toContain('<w:sectPr>');
  });

  it('escapes text that would otherwise break the document', () => {
    expect(escapeXml('Tom & Jerry <b>')).toBe('Tom &amp; Jerry &lt;b&gt;');
    expect(documentXml('Fish & chips')).toContain('Fish &amp; chips');
  });

  it('produces a docx whose first bytes are a zip', () => {
    const bytes = buildDocx('# Hello\n\nWorld.');
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(new TextDecoder().decode(bytes)).toContain('[Content_Types].xml');
    expect(new TextDecoder().decode(bytes)).toContain('word/document.xml');
  });

  it('makes a safe filename from any title', () => {
    expect(slug('The episode that vanished!')).toBe('the-episode-that-vanished');
    expect(slug('///')).toBe('document');
  });
});
