import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';
import { runAgent } from '@/lib/agents/engine';
import { resolveApproval } from '@/lib/workflows/approvals';
import { handleCommand } from '@/lib/agents/manager';
import {
  islamicResearchResponseSchema,
  islamicSourceCheckResponseSchema,
  quranEvidenceSchema,
  hadithEvidenceSchema,
} from '@/schemas/islamic';
import {
  disallowedHadith,
  defaultSourcePolicy,
  defaultVisualRules,
  renderSourcePolicy,
  renderVisualRules,
  violatedVisualRules,
} from '@/lib/islamic/policy';
import { getSourcePolicy, getVisualRules, usesIslamicWorkforce } from '@/lib/islamic/resolve';
import { arabicOverlays, containsArabic } from '@/lib/islamic/arabic';
import { buildAss } from '@/lib/media/captions';
import { BLOCKING_STATUSES, isBlocking, VERIFICATION_STATUSES } from '@/types/islamic';
import { makeIslamicWorkspace, OWNER_ID } from './helpers';
import { uuid } from '@/lib/ids';

/** Demo Mode: no database, no provider keys, simulated AI output. */
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('DISABLE_SIMULATED_MEDIA', '');
});

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

describe('Islamic research schema', () => {
  it('accepts null for every reference, so "I do not know" is expressible', () => {
    // This is the design decision the whole feature rests on: a model that has
    // no legitimate way to say "unknown" will invent something.
    const verse = quranEvidenceSchema.parse({
      surah: 'Al-Kahf',
      surah_number: null,
      ayah_number: null,
      arabic: null,
      translation: null,
      translation_source: null,
      reference: null,
      relevance: 'Central to the topic.',
    });
    expect(verse.arabic).toBeNull();
    expect(verse.ayah_number).toBeNull();
  });

  it('will not accept a hadith without a grading', () => {
    const withoutGrading = {
      collection: 'Sahih al-Bukhari',
      reference: '1',
      narrator: null,
      text: 'Actions are judged by intentions.',
      arabic: null,
      grading_source: null,
      relevance: 'Opening the topic.',
    };
    expect(hadithEvidenceSchema.safeParse(withoutGrading).success).toBe(false);

    // "unknown" is a legitimate grading; guessing "sahih" is what it prevents.
    expect(
      hadithEvidenceSchema.safeParse({ ...withoutGrading, grading: 'unknown' }).success,
    ).toBe(true);
    expect(
      hadithEvidenceSchema.safeParse({ ...withoutGrading, grading: 'invented' }).success,
    ).toBe(false);
  });

  it('rejects a research package with no key points', () => {
    const base = {
      topic: 'Tawakkul',
      summary: 'A summary long enough to be worth reading by anybody at all, really.',
      audience: 'General',
      content_goal: 'Explain',
      key_points: [],
    };
    expect(islamicResearchResponseSchema.safeParse(base).success).toBe(false);
    expect(
      islamicResearchResponseSchema.safeParse({ ...base, key_points: ['Reliance on Allah.'] })
        .success,
    ).toBe(true);
  });

  it('defaults every evidence array to empty rather than requiring invention', () => {
    const parsed = islamicResearchResponseSchema.parse({
      topic: 'Tawakkul',
      summary: 'A summary long enough to be worth reading by anybody at all, really.',
      audience: 'General',
      content_goal: 'Explain',
      key_points: ['Reliance on Allah.'],
    });
    expect(parsed.quran_evidence).toEqual([]);
    expect(parsed.hadith_evidence).toEqual([]);
    expect(parsed.areas_of_difference).toEqual([]);
  });

  it('constrains verification status to the defined set', () => {
    const finding = {
      claim: 'A claim',
      location: null,
      category: 'SAHIH_HADITH',
      explanation: 'Because of this.',
      correction: null,
      required_action: null,
    };
    for (const status of VERIFICATION_STATUSES) {
      expect(
        islamicSourceCheckResponseSchema.safeParse({
          summary: 'A summary long enough to be meaningful.',
          findings: [{ ...finding, status }],
        }).success,
      ).toBe(true);
    }
    expect(
      islamicSourceCheckResponseSchema.safeParse({
        summary: 'A summary long enough to be meaningful.',
        findings: [{ ...finding, status: 'PROBABLY_FINE' }],
      }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Blocking behaviour                                                  */
/* ------------------------------------------------------------------ */

describe('source verification blocking', () => {
  it('treats incorrect and questionable as blocking, and needs-source as not', () => {
    expect(BLOCKING_STATUSES).toEqual(['INCORRECT', 'QUESTIONABLE']);
    expect(isBlocking('INCORRECT')).toBe(true);
    expect(isBlocking('QUESTIONABLE')).toBe(true);
    // NEEDS_SOURCE is a request, not a defect. Blocking on it would train the
    // operator to click through blocks.
    expect(isBlocking('NEEDS_SOURCE')).toBe(false);
    expect(isBlocking('DIFFERENCE_OF_OPINION')).toBe(false);
    expect(isBlocking('VERIFIED')).toBe(false);
  });

  it('stops the mission when the checker finds a religious source error', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();

    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic video',
      objective: 'Research and verify',
      workflowKey: 'islamic_research',
    });

    // Run the research step normally.
    const researchTask = tasks.find((t) => t.step_key === 'research')!;
    await runAgent(store, OWNER_ID, researchTask.id);

    const research = (await store.list('islamic_research', { where: { mission_id: mission.id } }))[0];
    expect(research).toBeTruthy();

    // Then hand the checker a finding it must block on.
    const checkTask = tasks.find((t) => t.step_key === 'source_check')!;
    await store.update('tasks', checkTask.id, { status: 'queued' });

    const { islamicSourceVerify } = await import('@/lib/agents/islamic');
    const result = await islamicSourceVerify.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: (await store.get('agents', islamicAgents.checker.id))!,
        task: (await store.get('tasks', checkTask.id))!,
        mission,
        business: islamicBusiness,
        memory: [],
        businessMemory: '',
        previousOutputs: { research: { research_id: research!.id } },
      },
      {
        summary: 'One hadith is attributed to the wrong collection.',
        findings: [
          {
            claim: 'A hadith presented as being in Sahih al-Bukhari.',
            location: 'Evidence 2',
            category: 'SAHIH_HADITH',
            status: 'INCORRECT',
            explanation: 'It is not in that collection.',
            correction: null,
            required_action: 'Confirm the collection before use.',
          },
        ],
        outstanding: [],
        policy_violations: [],
      },
    );

    expect(result.blocked).toBeTruthy();
    expect(result.blocked).toContain('religious source');
    expect(result.output.verdict).toBe('blocked');

    // The package is marked, not silently left as reviewed.
    const updated = await store.get('islamic_research', research!.id);
    expect(updated!.verification_status).toBe('blocked');
  });

  it('computes the verdict from the findings, not from what the model claims', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic research',
      objective: 'Research',
      workflowKey: 'islamic_research',
    });
    const checkTask = tasks.find((t) => t.step_key === 'source_check')!;
    const { islamicSourceVerify } = await import('@/lib/agents/islamic');

    // A cheerful summary next to a QUESTIONABLE finding must still block.
    const result = await islamicSourceVerify.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: (await store.get('agents', islamicAgents.checker.id))!,
        task: (await store.get('tasks', checkTask.id))!,
        mission,
        business: islamicBusiness,
        memory: [],
        businessMemory: '',
        previousOutputs: {},
      },
      {
        summary: 'Everything looks good to me, no problems at all here.',
        findings: [
          {
            claim: 'A widely-circulated quotation.',
            location: null,
            category: 'UNVERIFIED',
            status: 'QUESTIONABLE',
            explanation: 'I cannot place this in any collection.',
            correction: null,
            required_action: 'Verify or remove.',
          },
        ],
        outstanding: [],
        policy_violations: [],
      },
    );

    expect(result.output.verdict).toBe('blocked');
    expect(result.blocked).toBeTruthy();
  });

  it('passes with notes when claims only need a source', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();
    const { mission, tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic research',
      objective: 'Research',
      workflowKey: 'islamic_research',
    });
    const checkTask = tasks.find((t) => t.step_key === 'source_check')!;
    const { islamicSourceVerify } = await import('@/lib/agents/islamic');

    const result = await islamicSourceVerify.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: (await store.get('agents', islamicAgents.checker.id))!,
        task: (await store.get('tasks', checkTask.id))!,
        mission,
        business: islamicBusiness,
        memory: [],
        businessMemory: '',
        previousOutputs: {},
      },
      {
        summary: 'Sound overall; two references need confirming.',
        findings: [
          {
            claim: 'A verse cited without a reference.',
            location: null,
            category: 'QURAN',
            status: 'NEEDS_SOURCE',
            explanation: 'No surah or ayah given.',
            correction: null,
            required_action: 'Add the reference.',
          },
        ],
        outstanding: ['Confirm the ayah number.'],
        policy_violations: [],
      },
    );

    expect(result.blocked).toBeUndefined();
    expect(result.output.verdict).toBe('pass_with_notes');
  });
});

/* ------------------------------------------------------------------ */
/* Approval gating                                                     */
/* ------------------------------------------------------------------ */

describe('source check before script approval', () => {
  it('refuses to approve a script when the channel requires a check and none exists', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const policy = await getSourcePolicy(store, OWNER_ID, islamicBusiness.id);
    expect(policy.require_source_check_before_script_approval).toBe(true);

    const scriptId = uuid();
    const approval = await store.insert('approvals', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: islamicBusiness.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'script',
      title: 'Approve script',
      summary: 'Ready for review.',
      payload: { script_id: scriptId },
      status: 'pending',
      feedback: null,
      is_demo: false,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });

    await expect(
      resolveApproval(store, OWNER_ID, approval.id, 'approve'),
    ).rejects.toThrow(/source check/i);

    // And it is still pending — a refused approval must not half-resolve.
    const after = await store.get('approvals', approval.id);
    expect(after!.status).toBe('pending');
  });

  it('refuses when the latest check blocked, and allows once one passes', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const scriptId = await insertScript(store, islamicBusiness.id);

    const makeApproval = async () =>
      store.insert('approvals', {
        id: uuid(),
        owner_id: OWNER_ID,
        business_id: islamicBusiness.id,
        mission_id: null,
        task_id: null,
        agent_id: null,
        kind: 'script',
        title: 'Approve script',
        summary: 'Ready for review.',
        payload: { script_id: scriptId },
        status: 'pending' as const,
        feedback: null,
        is_demo: false,
        created_at: new Date().toISOString(),
        resolved_at: null,
      });

    const check = {
      id: uuid(),
      business_id: islamicBusiness.id,
      research_id: null,
      script_id: scriptId,
      video_id: null,
      mission_id: null,
      task_id: null,
      subject: 'script' as const,
      summary: 'A hadith is misattributed.',
      findings: [],
      outstanding: [],
      policy_violations: [],
      is_demo: false,
      created_at: new Date(Date.now() - 5000).toISOString(),
    };
    await store.insert('islamic_source_checks', { ...check, verdict: 'blocked' });

    const first = await makeApproval();
    await expect(resolveApproval(store, OWNER_ID, first.id, 'approve')).rejects.toThrow(
      /blocked this script/i,
    );

    // A later, passing check supersedes it.
    await store.insert('islamic_source_checks', {
      ...check,
      id: uuid(),
      verdict: 'pass',
      summary: 'Sources hold up.',
      created_at: new Date().toISOString(),
    });

    const second = await makeApproval();
    const resolved = await resolveApproval(store, OWNER_ID, second.id, 'approve');
    expect(resolved.approval.status).toBe('approved');
  });

  it('does not gate a channel that has no Islamic agents', async () => {
    const { store, business } = await makeIslamicWorkspace();
    expect(await usesIslamicWorkforce(store, OWNER_ID, business.id)).toBe(false);
    const scriptId = await insertScript(store, business.id);

    const approval = await store.insert('approvals', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'script',
      title: 'Approve script',
      summary: 'Ready.',
      payload: { script_id: scriptId },
      status: 'pending',
      feedback: null,
      is_demo: false,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });

    const resolved = await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    expect(resolved.approval.status).toBe('approved');
  });
});

/** A minimal script row, so approving one exercises the real domain effects. */
async function insertScript(
  store: Awaited<ReturnType<typeof makeIslamicWorkspace>>['store'],
  businessId: string,
): Promise<string> {
  const id = uuid();
  await store.insert('youtube_scripts', {
    id,
    business_id: businessId,
    idea_id: uuid(),
    research_id: null,
    task_id: null,
    title: 'Test script',
    sections: [{ kind: 'hook', heading: 'Opening', body: 'Some narration.' }],
    word_count: 3,
    estimated_duration_seconds: 30,
    tone: 'Measured',
    audience: 'General',
    goal: 'Explain',
    version: 1,
    status: 'awaiting_approval',
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return id;
}

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

describe('source policy', () => {
  it('defaults to the cautious end of every choice', () => {
    const policy = defaultSourcePolicy(OWNER_ID, uuid());
    expect(policy.require_quran_reference).toBe(true);
    expect(policy.require_hadith_grading).toBe(true);
    expect(policy.require_source_check_before_script_approval).toBe(true);
    expect(policy.require_difference_labelling).toBe(true);
    expect(policy.weak_hadith_policy).toBe('labelled');
    // And assumes nothing about school or translation.
    expect(policy.methodology_notes).toBe('');
    expect(policy.preferred_translation).toBe('');
  });

  it('renders the operator’s choices into the prompt, not the application’s', () => {
    const policy = defaultSourcePolicy(OWNER_ID, uuid());
    const text = renderSourcePolicy({
      ...policy,
      preferred_translation: 'Saheeh International',
      weak_hadith_policy: 'never',
    });
    expect(text).toContain('Saheeh International');
    expect(text).toMatch(/do not use weak/i);
    expect(text).toMatch(/difference of opinion/i);
  });

  it('flags weak hadith according to the channel’s policy', () => {
    const base = defaultSourcePolicy(OWNER_ID, uuid());
    const evidence = [
      { collection: 'Sahih al-Bukhari', reference: '1', grading: 'sahih' as const },
      { collection: 'Sunan Ibn Majah', reference: '224', grading: 'daif' as const },
      { collection: 'Unknown', reference: null, grading: 'unknown' as const },
    ];

    expect(disallowedHadith(evidence, { ...base, weak_hadith_policy: 'allowed' })).toEqual([]);

    const labelled = disallowedHadith(evidence, { ...base, weak_hadith_policy: 'labelled' });
    expect(labelled).toHaveLength(2);
    expect(labelled[0]).toMatch(/labelled/i);

    const never = disallowedHadith(evidence, { ...base, weak_hadith_policy: 'never' });
    expect(never).toHaveLength(2);
    expect(never[0]).toMatch(/does not use/i);
  });

  it('creates a policy per business rather than one shared across channels', async () => {
    const { store, business, islamicBusiness } = await makeIslamicWorkspace();
    const a = await getSourcePolicy(store, OWNER_ID, business.id);
    const b = await getSourcePolicy(store, OWNER_ID, islamicBusiness.id);
    expect(a.id).not.toBe(b.id);
    expect(a.business_id).toBe(business.id);
    expect(b.business_id).toBe(islamicBusiness.id);
  });
});

/* ------------------------------------------------------------------ */
/* Visual restrictions                                                 */
/* ------------------------------------------------------------------ */

describe('visual restrictions', () => {
  const rules = defaultVisualRules(OWNER_ID, uuid());

  it('defaults to the restrictive option for every rule', () => {
    expect(rules.no_prophet_depiction).toBe(true);
    expect(rules.no_divine_depiction).toBe(true);
    expect(rules.no_generated_sacred_text).toBe(true);
    expect(rules.require_calligraphy_approval).toBe(true);
    expect(rules.human_depiction).toBe('faceless');
    expect(rules.background_music).toBe('none');
  });

  it('reaches the visual agents as hard constraints', () => {
    const text = renderVisualRules(rules);
    expect(text).toMatch(/never depict any prophet/i);
    expect(text).toMatch(/image models produce corrupted arabic/i);
    expect(text).toMatch(/silhouettes/i);
    expect(text).toMatch(/no background music/i);
  });

  it('catches a scene that asks an image model to draw a Prophet', () => {
    const violations = violatedVisualRules(
      {
        scene_number: 4,
        image_prompt: 'A portrait of Prophet Yusuf standing in the Egyptian court',
        visual_direction: '',
      },
      rules,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('Scene 4');
    expect(violations[0]).toMatch(/prophet/i);
  });

  it('catches Arabic sent into an image prompt', () => {
    const violations = violatedVisualRules(
      { scene_number: 2, image_prompt: 'Calligraphy reading بِسْمِ اللَّهِ on parchment' },
      rules,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/on-screen text layer/i);
  });

  it('catches a request for scriptural text without any Arabic characters', () => {
    const violations = violatedVisualRules(
      { scene_number: 7, image_prompt: 'A page showing Quran verse text in Arabic script' },
      rules,
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it('leaves ordinary imagery alone', () => {
    expect(
      violatedVisualRules(
        {
          scene_number: 1,
          image_prompt: 'A desert caravan at dawn, wide shot, warm light',
          visual_direction: 'Slow push in',
        },
        rules,
      ),
    ).toEqual([]);
  });

  it('applies nothing when a channel has no rules', () => {
    expect(
      violatedVisualRules({ scene_number: 1, image_prompt: 'A portrait of Prophet Yusuf' }, null),
    ).toEqual([]);
    expect(renderVisualRules(null)).toBe('');
  });

  it('blocks the visual plan rather than saving scenes that break the rules', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();
    await getVisualRules(store, OWNER_ID, islamicBusiness.id);

    const { visualPlan } = await import('@/lib/agents/production/visuals');
    const { newVideo } = await import('@/lib/production/defaults');

    const video = newVideo({ business_id: islamicBusiness.id, number: 1, title: 'Test' });
    await store.insert('youtube_videos', video);

    const task = await store.insert('tasks', {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: islamicBusiness.id,
      mission_id: null,
      agent_id: islamicAgents.researcher.id,
      step_key: 'visual_plan',
      title: 'Plan visuals',
      description: '',
      status: 'running',
      priority: 'normal',
      progress: 0,
      input: { video_id: video.id },
      output: null,
      error: null,
      is_demo: false,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      due_at: null,
    });

    const result = await visualPlan.persist!(
      {
        store,
        ownerId: OWNER_ID,
        agent: (await store.get('agents', islamicAgents.researcher.id))!,
        task,
        mission: null,
        business: islamicBusiness,
        memory: [],
        businessMemory: '',
        previousOutputs: {},
      },
      {
        scenes: [
          {
            scene_number: 1,
            narration_text: 'The story begins.',
            duration_estimate: 10,
            visual_type: 'image',
            visual_description: 'A depiction of Prophet Yusuf, face shown clearly',
            stock_search_query: '',
            image_prompt: 'Portrait of Prophet Yusuf, face shown clearly',
            video_prompt: '',
            on_screen_text: '',
            animation_notes: '',
            transition: 'cut',
            importance: 3,
            asset_strategy: 'generated_image',
          },
        ],
        strategy_rationale: 'Generated stills throughout.',
      } as never,
    );

    expect(result.blocked).toBeTruthy();
    expect(result.blocked).toMatch(/visual rules/i);

    // Crucially, nothing was written for the Asset Agent to pick up and spend on.
    const scenes = await store.list('youtube_scenes', { where: { video_id: video.id } });
    expect(scenes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Arabic                                                              */
/* ------------------------------------------------------------------ */

describe('verified Arabic rendering', () => {
  it('detects Arabic script', () => {
    expect(containsArabic('بِسْمِ اللَّهِ')).toBe(true);
    expect(containsArabic('Bismillah')).toBe(false);
  });

  it('shows nothing when the wording was never verified', () => {
    // `arabic: null` is the agent saying it did not reliably know the wording.
    // Approximating it here would defeat the entire design.
    const overlays = arabicOverlays(
      [
        {
          surah: 'Al-Kahf',
          surah_number: 18,
          ayah_number: '10',
          arabic: null,
          translation: 'Our Lord, grant us mercy from Yourself.',
          translation_source: null,
          reference: null,
          relevance: 'Central.',
        },
      ],
      { arabic_display: 'arabic_with_translation' },
    );
    expect(overlays).toEqual([]);
  });

  it('renders verified Arabic with its translation and reference', () => {
    const overlays = arabicOverlays(
      [
        {
          surah: 'Al-Kahf',
          surah_number: 18,
          ayah_number: '10',
          arabic: 'رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً',
          translation: 'Our Lord, grant us mercy from Yourself.',
          translation_source: 'Saheeh International',
          reference: null,
          relevance: 'Central.',
        },
      ],
      { arabic_display: 'arabic_with_translation' },
    );
    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.arabic).toContain('رَبَّنَا');
    expect(overlays[0]!.translation).toBeTruthy();
    expect(overlays[0]!.reference).toContain('Al-Kahf');
  });

  it('honours a channel that has turned Arabic off', () => {
    const evidence = [
      {
        surah: 'Al-Kahf',
        surah_number: 18,
        ayah_number: '10',
        arabic: 'رَبَّنَا',
        translation: 'Our Lord',
        translation_source: null,
        reference: null,
        relevance: 'Central.',
      },
    ];
    expect(arabicOverlays(evidence, { arabic_display: 'none' })).toEqual([]);
    expect(arabicOverlays(evidence, { arabic_display: 'arabic_only' })[0]!.translation).toBeNull();
  });

  it('gives Arabic a font that can shape it, rather than the caption font', () => {
    const ass = buildAss(
      [{ start: 0, end: 4, text: 'رَبَّنَا آتِنَا', style: 'arabic' }],
      { width: 1920, height: 1080 },
    );
    // The caption font has no Arabic coverage; text set in it renders as boxes.
    expect(ass).toMatch(/Style: Arabic,Noto Naskh Arabic/);
    expect(ass).toContain(',Arabic,,0,0,0,,');
    expect(ass).toContain('رَبَّنَا');
  });
});

/* ------------------------------------------------------------------ */
/* Workflow and routing                                                */
/* ------------------------------------------------------------------ */

describe('Islamic workflow', () => {
  it('verifies sources before a word is written, and reuses the existing pipeline after', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const { tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic video',
      objective: 'Produce',
      workflowKey: 'islamic_youtube_video',
    });

    const keys = tasks.map((t) => t.step_key);
    expect(keys.indexOf('source_check')).toBeLessThan(keys.indexOf('script'));
    expect(keys.indexOf('script')).toBeLessThan(keys.indexOf('script_review'));
    expect(keys.indexOf('script_review')).toBeLessThan(keys.indexOf('fact_check'));

    // After the gate it is the ordinary production pipeline, not a copy.
    for (const key of [
      'voiceover_plan',
      'voiceover',
      'visual_plan',
      'assets',
      'thumbnail_concepts',
      'metadata',
      'assembly',
      'quality_check',
    ]) {
      expect(keys).toContain(key);
    }

    // And the one approval gate is still the script.
    const gate = tasks.filter((t) => t.input.requires_approval === true);
    expect(gate).toHaveLength(1);
    expect(gate[0]!.step_key).toBe('fact_check');
  });

  it('runs the research and verification steps end to end in Demo Mode', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const { mission } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic research',
      objective: 'Research and verify',
      workflowKey: 'islamic_research',
    });

    const run = await runMission(store, OWNER_ID, mission.id, { maxSteps: 6 });
    expect(run.status).toBe('needs_approval');

    const research = await store.list('islamic_research', { where: { mission_id: mission.id } });
    expect(research).toHaveLength(1);
    expect(research[0]!.business_id).toBe(islamicBusiness.id);

    const checks = await store.list('islamic_source_checks', { where: { mission_id: mission.id } });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.research_id).toBe(research[0]!.id);
  });

  it('assigns Islamic steps to the Islamic channel’s own agents', async () => {
    const { store, islamicBusiness, islamicAgents } = await makeIslamicWorkspace();
    const { tasks } = await createMission(store, {
      ownerId: OWNER_ID,
      businessId: islamicBusiness.id,
      title: 'Islamic research',
      objective: 'Research',
      workflowKey: 'islamic_research',
    });

    expect(tasks.find((t) => t.step_key === 'research')!.agent_id).toBe(
      islamicAgents.researcher.id,
    );
    expect(tasks.find((t) => t.step_key === 'source_check')!.agent_id).toBe(
      islamicAgents.checker.id,
    );
  });
});

describe('command routing', () => {
  it('routes an Islamic instruction to the Islamic channel', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const result = await handleCommand(
      store,
      OWNER_ID,
      'Give me 10 authentic Islamic YouTube video ideas about improving salah.',
    );

    expect(result.mission).toBeTruthy();
    expect(result.mission!.business_id).toBe(islamicBusiness.id);
    const tasks = await store.list('tasks', { where: { mission_id: result.mission!.id } });
    expect(tasks.some((t) => t.input.capability === 'islamic.content_plan' || t.title.includes('Islamic'))).toBe(
      true,
    );
  });

  it('recognises a full Islamic video request and uses the Islamic workflow', async () => {
    const { store, islamicBusiness } = await makeIslamicWorkspace();
    const result = await handleCommand(
      store,
      OWNER_ID,
      'Create an 8-minute Islamic video explaining the story of Prophet Yusuf using reliable Quran references.',
    );

    expect(result.plan!.workflow).toBe('islamic_youtube_video');
    expect(result.mission!.business_id).toBe(islamicBusiness.id);
  });

  it('sends a source-check request to the checker', async () => {
    const { store } = await makeIslamicWorkspace();
    const result = await handleCommand(
      store,
      OWNER_ID,
      'Check whether the hadith used in Video #16 is authentic.',
    );
    const tasks = await store.list('tasks', { where: { mission_id: result.mission!.id } });
    expect(tasks[0]!.input.capability).toBe('islamic.source_verify');
  });

  it('does NOT route an ordinary YouTube request through the Islamic agents', async () => {
    const { store, business } = await makeIslamicWorkspace();
    const result = await handleCommand(
      store,
      OWNER_ID,
      'Create a video about the collapse of the Bronze Age.',
    );

    expect(result.plan!.workflow).toBe('youtube_video_full');
    expect(result.mission!.business_id).toBe(business.id);

    const tasks = await store.list('tasks', { where: { mission_id: result.mission!.id } });
    for (const task of tasks) {
      expect(String(task.input.capability ?? '')).not.toMatch(/^islamic\./);
    }
  });

  it('falls back to the general route when no Islamic agent exists', async () => {
    const { store, business, islamicAgents } = await makeIslamicWorkspace();
    // Archive the specialists: an Islamic route with nobody behind it would
    // create a mission that can never run.
    for (const agent of Object.values(islamicAgents)) {
      await store.update('agents', agent.id, {
        archived_at: new Date().toISOString(),
        status: 'disabled',
        capabilities: [],
      });
    }

    const result = await handleCommand(
      store,
      OWNER_ID,
      'Create a video about the story of Prophet Yusuf.',
    );
    expect(result.plan!.workflow).toBe('youtube_video_full');
    expect(result.mission!.business_id).toBe(business.id);
  });
});
