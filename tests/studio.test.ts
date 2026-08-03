import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyAsset,
  isSimulatedProvider,
  isVisualAsset,
  summariseProvenance,
} from '@/lib/production/provenance';
import {
  fitTimelineToNarration,
  validateTimeline,
} from '@/lib/production/timeline-validation';
import { fitToAudio, separate, toSrt, toVtt, validateCues } from '@/lib/media/subtitles';
import { buildLicenceReport, licenceReportMarkdown } from '@/lib/production/licence-report';
import { buildDossier } from '@/lib/approvals/dossier';
import { resolveApproval } from '@/lib/workflows/approvals';
import { RENDER_PRESETS } from '@/lib/integrations/providers/types';
import { uuid } from '@/lib/ids';
import { makeWorkspace, OWNER_ID } from './helpers';
import type { MediaAsset } from '@/types/production';
import type { Approval } from '@/types/domain';
import type { TimelineItem } from '@/types/production';

/**
 * The studio: timing, captions, licences and the screen that decides whether a
 * video may be published.
 *
 * The theme running through these is that a *plausible* failure must be
 * distinguishable from a real success. A timeline whose pictures stop early
 * renders happily; captions that drift upload happily; an asset with no
 * recorded licence looks exactly like one with a good licence unless something
 * checks. None of these break loudly on their own, so they are checked here.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: uuid(),
    mission_id: null,
    video_id: null,
    scene_id: null,
    task_id: null,
    type: 'image',
    provider: 'openai',
    provider_asset_id: null,
    storage_path: '/tmp/a.png',
    public_url: 'https://example.test/a.png',
    mime_type: 'image/png',
    duration: null,
    width: 1536,
    height: 1024,
    file_size: 1024,
    generation_prompt: null,
    generation_cost: 0,
    status: 'ready',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as MediaAsset;
}

function item(start: number, end: number, assetId: string | null = uuid()): TimelineItem {
  return {
    start,
    end,
    scene_id: uuid(),
    video_asset_id: assetId,
    audio_asset_id: null,
    text_overlay: '',
    transition: 'cut',
    animation: 'none',
    volume: 1,
    metadata: {},
  } as TimelineItem;
}

/* ------------------------------------------------------------------ */

describe('a 12-minute narration makes a 12-minute video', () => {
  const TWELVE_MINUTES = 720;

  it('stretches an under-running timeline to cover the whole narration', () => {
    // The visual director planned ten minutes; the narrator took twelve.
    const planned = Array.from({ length: 30 }, (_, index) => item(index * 20, (index + 1) * 20));
    expect(planned[planned.length - 1]!.end).toBe(600);

    const fitted = fitTimelineToNarration(planned, TWELVE_MINUTES);
    expect(fitted[fitted.length - 1]!.end).toBeCloseTo(TWELVE_MINUTES, 0);
    expect(validateTimeline(fitted, TWELVE_MINUTES).blocking).toHaveLength(0);
  });

  it('squeezes an over-running timeline too', () => {
    const planned = Array.from({ length: 20 }, (_, index) => item(index * 60, (index + 1) * 60));
    const fitted = fitTimelineToNarration(planned, TWELVE_MINUTES);
    expect(fitted[fitted.length - 1]!.end).toBeCloseTo(TWELVE_MINUTES, 0);
  });

  it('keeps every scene proportional rather than stretching the last one', () => {
    const planned = [item(0, 10), item(10, 50), item(50, 60)];
    const fitted = fitTimelineToNarration(planned, 120);
    const lengths = fitted.map((entry) => entry.end - entry.start);
    // The 40s shot is still four times the 10s shots.
    expect(lengths[1]! / lengths[0]!).toBeCloseTo(4, 1);
  });

  it('leaves no gap between scenes after fitting', () => {
    const fitted = fitTimelineToNarration([item(0, 10), item(10, 20), item(20, 30)], 100);
    for (let i = 1; i < fitted.length; i += 1) {
      expect(fitted[i]!.start).toBeCloseTo(fitted[i - 1]!.end, 3);
    }
  });

  it('blocks a render whose pictures stop before the voice does', () => {
    // Ten minutes of picture over twelve minutes of narration renders happily
    // and ends on two minutes of black. Nothing else in the stack notices.
    const check = validateTimeline([item(0, 300), item(300, 600)], TWELVE_MINUTES);
    expect(check.blocking.map((problem) => problem.kind)).toContain('coverage_short');
    expect(check.blocking[0]!.message).toMatch(/finish on black/i);
  });

  it('warns rather than blocks when the pictures run slightly long', () => {
    const check = validateTimeline([item(0, 400), item(400, 740)], TWELVE_MINUTES);
    expect(check.blocking.filter((p) => p.kind === 'coverage_long')).toHaveLength(0);
    expect(check.problems.map((p) => p.kind)).toContain('coverage_long');
  });

  it('accepts rounding differences', () => {
    expect(validateTimeline([item(0, 719.9)], TWELVE_MINUTES).blocking).toHaveLength(0);
  });

  it('blocks a gap in the middle and a scene with no picture', () => {
    expect(
      validateTimeline([item(0, 100), item(140, 720)], TWELVE_MINUTES).blocking.map((p) => p.kind),
    ).toContain('gap');
    expect(
      validateTimeline([item(0, 720, null)], TWELVE_MINUTES).blocking.map((p) => p.kind),
    ).toContain('missing_asset');
  });

  it('refuses to render an empty timeline', () => {
    expect(validateTimeline([], 720).blocking.map((p) => p.kind)).toEqual(['no_items']);
  });
});

/* ------------------------------------------------------------------ */

describe('render presets', () => {
  it('trades speed against bitrate in the right direction', () => {
    expect(RENDER_PRESETS.draft.crf).toBeGreaterThan(RENDER_PRESETS.standard.crf);
    expect(RENDER_PRESETS.standard.crf).toBeGreaterThan(RENDER_PRESETS.high.crf);
    expect(RENDER_PRESETS.draft.speed).toBe('ultrafast');
    expect(RENDER_PRESETS.high.speed).toBe('slow');
  });

  it('says what each one is for', () => {
    for (const preset of Object.values(RENDER_PRESETS)) {
      expect(preset.note.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('subtitles', () => {
  const cues = [
    { startSeconds: 0, endSeconds: 3, text: 'The first line.' },
    { startSeconds: 3, endSeconds: 6.5, text: 'The second line.' },
  ];

  it('writes SubRip with comma decimals and CRLF', () => {
    const srt = toSrt(cues);
    expect(srt).toContain('00:00:00,000 --> 00:00:03,000');
    expect(srt).toContain('\r\n');
    expect(srt.startsWith('1')).toBe(true);
  });

  it('writes WebVTT with a header and full-stop decimals', () => {
    const vtt = toVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:03.000 --> 00:00:06.500');
  });

  it('keeps punctuation and non-English characters intact', () => {
    const text = 'Pokémon — “Porygon”, 1997… ¿verdad?';
    const srt = toSrt([{ startSeconds: 0, endSeconds: 2, text }]);
    expect(srt).toContain(text);
    expect(toVtt([{ startSeconds: 0, endSeconds: 2, text }])).toContain(text);
  });

  it('fits estimated cues to the narration that was actually produced', () => {
    // Estimated at 60s; the narrator took 90.
    const estimated = Array.from({ length: 20 }, (_, index) => ({
      startSeconds: index * 3,
      endSeconds: index * 3 + 3,
      text: `Line ${index}`,
    }));
    const fitted = fitToAudio(estimated, 90);
    expect(fitted[fitted.length - 1]!.endSeconds).toBeCloseTo(90, 0);
    expect(validateCues(fitted, 90).filter((p) => p.problem.includes('after the audio'))).toHaveLength(0);
  });

  it('leaves cues alone when the difference is noise', () => {
    const original = [{ startSeconds: 0, endSeconds: 60, text: 'x' }];
    expect(fitToAudio(original, 60.5)).toEqual(original);
  });

  it('reports every way a cue can be unusable', () => {
    const problems = validateCues(
      [
        { startSeconds: 5, endSeconds: 2, text: 'backwards' },
        { startSeconds: 2, endSeconds: 20, text: 'far too long on screen' },
        { startSeconds: 19, endSeconds: 19.1, text: '' },
        { startSeconds: 200, endSeconds: 202, text: 'past the end' },
      ],
      100,
    );
    const text = problems.map((problem) => problem.problem).join(' ');
    expect(text).toMatch(/ends before it starts/);
    expect(text).toMatch(/too long to read/);
    expect(text).toMatch(/is empty/);
    expect(text).toMatch(/after the audio has ended/);
  });

  it('removes overlaps introduced by rounding', () => {
    const separated = separate([
      { startSeconds: 0, endSeconds: 3.001, text: 'a' },
      { startSeconds: 3, endSeconds: 6, text: 'b' },
    ]);
    expect(validateCues(separated, 10).filter((p) => p.problem.includes('overlaps'))).toHaveLength(0);
  });

  it('passes a well-formed track', () => {
    expect(validateCues(cues, 10)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

describe('asset provenance', () => {
  it('recognises the simulated provider by its stored name', () => {
    // The asset records the descriptor *name*, not the slug. An equality check
    // against 'simulated' matched nothing and made every guard a no-op.
    expect(isSimulatedProvider('Simulated (Demo Mode)')).toBe(true);
    expect(isSimulatedProvider('simulated')).toBe(true);
    expect(isSimulatedProvider('ElevenLabs')).toBe(false);
  });

  it('classifies only the visual assets', () => {
    expect(isVisualAsset(asset({ type: 'image' }))).toBe(true);
    expect(isVisualAsset(asset({ type: 'thumbnail' }))).toBe(true);
    // Narration is our own synthesised speech; captions derive from it.
    expect(isVisualAsset(asset({ type: 'voiceover' }))).toBe(false);
    expect(isVisualAsset(asset({ type: 'subtitle_file' }))).toBe(false);
  });

  it('blocks an asset with nothing recorded about it', () => {
    const record = classifyAsset(asset({ provider: 'unknown' }));
    expect(record.provenance).toBe('unresolved');
    expect(record.reason).toMatch(/nobody can say/);
  });

  it('accepts a generated original', () => {
    const record = classifyAsset(
      asset({ generation_prompt: 'a quiet archive room, documentary lighting' }),
    );
    expect(record.provenance).toBe('generated_original');
  });

  it('flags a generated image whose prompt named protected property', () => {
    // "I generated it" is not a defence against having generated a trademarked
    // character.
    for (const prompt of [
      'Charizard breathing fire, card art style',
      'a Pokémon anime scene',
      'the Nintendo logo on a wall',
    ]) {
      const record = classifyAsset(asset({ generation_prompt: prompt }));
      expect(record.provenance, prompt).toBe('fair_use_review_required');
    }
  });

  it('keeps licence, creator and attribution from stock', () => {
    const record = classifyAsset(
      asset({
        provider: 'openverse',
        metadata: {
          provenance: 'licensed_stock',
          licence: 'by-sa',
          creator: 'A. Photographer',
          source: 'wikimedia',
          attribution_required: true,
          attribution: '“A hall” by A. Photographer — by-sa',
        },
      }),
    );
    expect(record.provenance).toBe('licensed_stock');
    expect(record.creator).toBe('A. Photographer');
    expect(record.attributionRequired).toBe(true);
    expect(record.restrictions.join(' ')).toMatch(/share-alike/i);
  });

  it('recognises public domain separately from a licence that needs a credit', () => {
    expect(classifyAsset(asset({ metadata: { licence: 'cc0' } })).provenance).toBe('public_domain');
    expect(classifyAsset(asset({ metadata: { licence: 'by' } })).provenance).toBe('licensed_stock');
  });

  it('flags licensed material that depicts protected property', () => {
    // A permissive licence on someone's photograph of a card does not license
    // the card.
    const record = classifyAsset(
      asset({
        metadata: {
          licence: 'by',
          search_query: 'Charizard card scan',
          attribution: 'a photo of a Pokémon card',
        },
      }),
    );
    expect(record.provenance).toBe('fair_use_review_required');
  });

  it('names owner responsibility on an uploaded asset', () => {
    const record = classifyAsset(
      asset({ provider: 'upload', metadata: { provenance: 'owner_uploaded' } }),
    );
    expect(record.provenance).toBe('owner_uploaded');
    expect(record.reason).toMatch(/responsibility stays with you/);
  });

  it('separates the blocking from the judgement calls', () => {
    const summary = summariseProvenance([
      asset({ provider: 'unknown' }),
      asset({ generation_prompt: 'Pikachu on a hill' }),
      asset({ metadata: { licence: 'cc0' } }),
      asset({ type: 'voiceover', provider: 'unknown' }),
    ]);
    expect(summary.records).toHaveLength(3); // the voiceover is not a visual
    expect(summary.blocking).toHaveLength(1);
    expect(summary.manualReview).toHaveLength(1);
    expect(summary.counts.public_domain).toBe(1);
  });

  it('never loses an attribution line', () => {
    const summary = summariseProvenance([
      asset({
        metadata: { licence: 'by', attribution_required: true, attribution: 'Credit line one' },
      }),
      asset({
        metadata: { licence: 'by', attribution_required: true, attribution: 'Credit line one' },
      }),
    ]);
    // De-duplicated, but never dropped: omitting one is a licence breach.
    expect(summary.attributions).toEqual(['Credit line one']);
  });
});

/* ------------------------------------------------------------------ */

async function videoWorkspace(options: { assets?: Partial<MediaAsset>[]; playable?: boolean } = {}) {
  const { store, business } = await makeWorkspace();
  const timestamp = new Date().toISOString();
  const videoId = uuid();

  const finalAssetId = uuid();
  if (options.playable !== false) {
    await store.insert('media_assets', {
      ...asset({
        id: finalAssetId,
        business_id: business.id,
        video_id: videoId,
        type: 'final_video',
        provider: 'ffmpeg',
        mime_type: 'video/mp4',
        duration: 720,
        file_size: 90_000_000,
        public_url: 'https://example.test/video.mp4',
        metadata: { preset: 'standard' },
      }),
    });
  }

  // A thumbnail and metadata by default, so a test about licences is not
  // failed by an unrelated missing-thumbnail blocker.
  const thumbnailId = uuid();
  await store.insert('media_assets', {
    ...asset({
      id: thumbnailId,
      business_id: business.id,
      video_id: videoId,
      type: 'thumbnail',
      provider: 'openai',
      generation_prompt: 'a bold close-up of an old television',
    }),
  });
  const metadataId = uuid();
  await store.insert('youtube_metadata', {
    id: metadataId,
    business_id: business.id,
    video_id: videoId,
    task_id: null,
    title: 'Why Porygon vanished',
    alternative_titles: ['The episode that disappeared'],
    description: 'A documentary.',
    short_description: 'A documentary.',
    tags: ['pokemon', 'documentary'],
    hashtags: ['#pokemon'],
    chapters: [{ start_seconds: 0, title: 'Opening' }],
    pinned_comment: 'Sources in the description.',
    version: 1,
    selected: true,
    is_demo: false,
    created_at: timestamp,
  });

  for (const override of options.assets ?? []) {
    await store.insert('media_assets', {
      ...asset({ business_id: business.id, video_id: videoId, ...override }),
    });
  }

  await store.insert('youtube_videos', {
    id: videoId,
    business_id: business.id,
    channel_id: null,
    idea_id: null,
    script_id: null,
    mission_id: null,
    number: 1,
    title: 'Why Porygon vanished',
    status: 'ready',
    stage: 'final_approval',
    blocked_reason: null,
    alternative_titles: [],
    selected_thumbnail_id: null,
    thumbnail_asset_id: thumbnailId,
    final_asset_id: options.playable === false ? null : finalAssetId,
    voiceover_id: null,
    timeline_id: null,
    metadata_id: metadataId,
    estimated_cost: 4,
    actual_cost: 4.2,
    published_external_id: null,
    publish_at: null,
    is_demo: false,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const approval: Approval = {
    id: uuid(),
    owner_id: OWNER_ID,
    business_id: business.id,
    mission_id: null,
    task_id: null,
    agent_id: null,
    kind: 'video',
    title: 'Approve the video',
    summary: 'Ready for final review',
    payload: { video_id: videoId },
    status: 'pending',
    feedback: null,
    resolved_at: null,
    is_demo: false,
    created_at: timestamp,
  };
  await store.insert('approvals', approval);

  return { store, business, videoId, approval };
}

describe('the licence report', () => {
  it('names every asset, its scene and where it came from', async () => {
    const { store, videoId } = await videoWorkspace({
      assets: [
        { metadata: { licence: 'by', creator: 'A. Photographer', attribution_required: true, attribution: 'Credit' } },
        { provider: 'unknown' },
      ],
    });
    const video = (await store.get('youtube_videos', videoId))!;
    const report = await buildLicenceReport(store, video);

    expect(report.records.length).toBeGreaterThanOrEqual(2);
    expect(report.blocking).toHaveLength(1);
    expect(report.attributions).toContain('Credit');
    // It must never read as clearance.
    expect(report.disclaimer).toMatch(/not legal advice/i);
    expect(report.disclaimer).toMatch(/no guarantee/i);
  });

  it('downloads as a readable document that carries the disclaimer', async () => {
    const { store, videoId } = await videoWorkspace({ assets: [{ provider: 'unknown' }] });
    const video = (await store.get('youtube_videos', videoId))!;
    const markdown = licenceReportMarkdown(await buildLicenceReport(store, video));

    expect(markdown).toContain('# Licence report');
    expect(markdown).toMatch(/not legal advice/i);
    expect(markdown).toContain('Blocking');
  });
});

/* ------------------------------------------------------------------ */

describe('the studio final approval', () => {
  it('puts the video, the licences, the quality and the money on one screen', async () => {
    const { store, approval } = await videoWorkspace({
      assets: [{ metadata: { licence: 'cc0' } }],
    });
    const dossier = await buildDossier(store, OWNER_ID, approval);
    const ids = dossier.panels.map((panel) => panel.id);

    for (const panel of ['video', 'metadata', 'captions', 'licences', 'cost']) {
      expect(ids, `the studio review must include ${panel}`).toContain(panel);
    }

    const player = dossier.panels.find((panel) => panel.id === 'video');
    expect(player!.kind).toBe('media');
    expect(dossier.summary.metrics.map((metric) => metric.label)).toEqual(
      expect.arrayContaining(['Duration', 'Resolution', 'File size', 'Render preset', 'Total cost']),
    );
  });

  it('refuses approval when there is no playable video', async () => {
    const { store, approval } = await videoWorkspace({ playable: false });
    const dossier = await buildDossier(store, OWNER_ID, approval);

    // Approving a video nobody can watch is not a decision.
    expect(dossier.actions.approve.consequence).toMatch(/cannot approve/i);
    expect(dossier.summary.notice).toMatch(/no playable video file/i);
  });

  it('refuses the approve decision itself when there is no playable video, not just the dossier text', async () => {
    // The dossier's "cannot approve" consequence is only ever advisory to
    // whatever renders it. The actual decision path — the one every caller
    // goes through, UI or API — has to refuse it too.
    const { store, approval } = await videoWorkspace({ playable: false });
    await expect(
      resolveApproval(store, OWNER_ID, approval.id, 'approve'),
    ).rejects.toThrow(/no rendered video file/i);

    const stillPending = await store.get('approvals', approval.id);
    expect(stillPending!.status).toBe('pending');
  });

  it('allows the approve decision through when the render is locally stored with no public URL', async () => {
    // The regression this guards: LocalMediaStorage never sets public_url, so
    // a check against public_url alone would refuse every approval outside a
    // Supabase Storage setup — including in Demo Mode, where nothing else is
    // wrong with the video.
    const { store, business } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const videoId = uuid();
    const finalId = uuid();
    await store.insert('media_assets', {
      ...asset({
        id: finalId,
        business_id: business.id,
        video_id: videoId,
        type: 'final_video',
        provider: 'ffmpeg',
        mime_type: 'video/mp4',
        duration: 720,
        public_url: null,
      }),
    });
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: business.id,
      channel_id: null,
      idea_id: null,
      script_id: null,
      mission_id: null,
      number: 1,
      title: 'A locally rendered video',
      status: 'ready',
      stage: 'final_approval',
      blocked_reason: null,
      alternative_titles: [],
      selected_thumbnail_id: null,
      thumbnail_asset_id: null,
      final_asset_id: finalId,
      voiceover_id: null,
      timeline_id: null,
      metadata_id: null,
      estimated_cost: 0,
      actual_cost: 0,
      published_external_id: null,
      publish_at: null,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'video',
      title: 'Approve',
      summary: '',
      payload: { video_id: videoId },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const result = await resolveApproval(store, OWNER_ID, approval.id, 'approve');
    expect(result.approval.status).toBe('approved');
  });

  it('names an unresolved licence as a blocker in the summary', async () => {
    const { store, approval } = await videoWorkspace({ assets: [{ provider: 'unknown' }] });
    const dossier = await buildDossier(store, OWNER_ID, approval);
    expect(dossier.summary.notice).toMatch(/Unresolved asset licence/);
  });

  it('warns about a judgement call without calling it a blocker', async () => {
    const { store, approval } = await videoWorkspace({
      assets: [{ generation_prompt: 'Charizard in flight' }],
    });
    const dossier = await buildDossier(store, OWNER_ID, approval);

    expect(dossier.summary.notice).toMatch(/need your judgement/i);
    expect(dossier.summary.notice).toMatch(/no legal guarantee/i);
    // It is still approvable — the operator decides, not the software.
    expect(dossier.actions.approve.consequence).not.toMatch(/cannot approve/i);
  });

  it('breaks the cost down by what it was spent on', async () => {
    const { store, approval } = await videoWorkspace({
      assets: [{ provider: 'openai', generation_cost: 0.07, generation_prompt: 'a room' }],
    });
    const dossier = await buildDossier(store, OWNER_ID, approval);
    const ledger = dossier.panels.find((panel) => panel.id === 'cost');
    const labels = (ledger as { lines: { label: string }[] }).lines.map((line) => line.label);

    expect(labels).toContain('openai');
    expect(labels).toContain('Rendering (local)');
    expect(labels).toContain('Total');
  });

  it('treats a locally-stored render with no public URL as playable through the authenticated route', async () => {
    // LocalMediaStorage never sets public_url — that is by design, since the
    // file is only reachable to someone signed in. A ready asset with a
    // storage_path must still be playable, or Demo Mode and any deployment
    // without Supabase Storage can never approve a video for publishing.
    const { store, business } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const videoId = uuid();
    const finalId = uuid();
    await store.insert('media_assets', {
      ...asset({
        id: finalId,
        business_id: business.id,
        video_id: videoId,
        type: 'final_video',
        provider: 'ffmpeg',
        mime_type: 'video/mp4',
        duration: 720,
        public_url: null,
      }),
    });
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: business.id,
      channel_id: null,
      idea_id: null,
      script_id: null,
      mission_id: null,
      number: 1,
      title: 'A locally rendered video',
      status: 'ready',
      stage: 'final_approval',
      blocked_reason: null,
      alternative_titles: [],
      selected_thumbnail_id: null,
      thumbnail_asset_id: null,
      final_asset_id: finalId,
      voiceover_id: null,
      timeline_id: null,
      metadata_id: null,
      estimated_cost: 0,
      actual_cost: 0,
      published_external_id: null,
      publish_at: null,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'video',
      title: 'Approve',
      summary: '',
      payload: { video_id: videoId },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: false,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const dossier = await buildDossier(store, OWNER_ID, approval);
    const player = dossier.panels.find((panel) => panel.id === 'video') as {
      items: { url: string | null }[];
    };
    expect(player.items[0]!.url).toBe(`/api/media/${finalId}`);
    expect(dossier.actions.approve.consequence).not.toMatch(/cannot approve/i);
  });

  it('says plainly when the render came from the simulated provider', async () => {
    const { store, business } = await makeWorkspace();
    const timestamp = new Date().toISOString();
    const videoId = uuid();
    const finalId = uuid();
    await store.insert('media_assets', {
      ...asset({
        id: finalId,
        business_id: business.id,
        video_id: videoId,
        type: 'final_video',
        provider: 'Simulated (Demo Mode)',
        mime_type: 'video/mp4',
        duration: 720,
        public_url: 'https://example.test/v.mp4',
      }),
    });
    await store.insert('youtube_videos', {
      id: videoId,
      business_id: business.id,
      channel_id: null,
      idea_id: null,
      script_id: null,
      mission_id: null,
      number: 1,
      title: 'Demo video',
      status: 'ready',
      stage: 'final_approval',
      blocked_reason: null,
      alternative_titles: [],
      selected_thumbnail_id: null,
      thumbnail_asset_id: null,
      final_asset_id: finalId,
      voiceover_id: null,
      timeline_id: null,
      metadata_id: null,
      estimated_cost: 0,
      actual_cost: 0,
      published_external_id: null,
      publish_at: null,
      is_demo: true,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const approval: Approval = {
      id: uuid(),
      owner_id: OWNER_ID,
      business_id: business.id,
      mission_id: null,
      task_id: null,
      agent_id: null,
      kind: 'video',
      title: 'Approve',
      summary: '',
      payload: { video_id: videoId },
      status: 'pending',
      feedback: null,
      resolved_at: null,
      is_demo: true,
      created_at: timestamp,
    };
    await store.insert('approvals', approval);

    const dossier = await buildDossier(store, OWNER_ID, approval);
    const player = dossier.panels.find((panel) => panel.id === 'video') as {
      items: { note: string | null }[];
    };
    expect(player.items[0]!.note).toMatch(/must not be published/i);
  });
});
