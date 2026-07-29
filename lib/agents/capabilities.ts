import type { z } from 'zod';
import { uuid } from '@/lib/ids';
import type { StructuredSchema } from '@/lib/integrations/ai/types';
import { newScene } from '@/lib/production/defaults';
import { PRODUCTION_HANDLERS } from './production';
import { ISLAMIC_HANDLERS } from './islamic';
import { resolveVideo } from '@/lib/production/resolve';
import { thumbnailPlanResponseSchema } from '@/schemas/production';
import {
  channelAnalysisResponseSchema,
  factCheckResponseSchema,
  productionPlanResponseSchema,
  youtubeIdeasResponseSchema,
  youtubeResearchResponseSchema,
  youtubeScriptResponseSchema,
} from '@/schemas/youtube';
import {
  etsyListingResponseSchema,
  etsyOpportunitiesResponseSchema,
  keywordResponseSchema,
} from '@/schemas/etsy';
import type {
  ApprovalKind,
  OpportunityBreakdown,
  ScriptSection,
} from '@/types/domain';
import {
  renderBusiness,
  renderMemory,
  renderPreviousOutputs,
  type RunContext,
} from './context';

export interface ApprovalRequest {
  kind: ApprovalKind;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

/** Spend a provider step actually incurred, recorded alongside AI token cost. */
export interface ProviderSpend {
  amount: number;
  provider: string;
  product: string;
}

export interface PersistResult {
  /** One line for the activity feed, written in the agent's voice. */
  summary: string;
  output: Record<string, unknown>;
  approval?: ApprovalRequest;
  /** Set when downstream steps must not run — e.g. a failed fact check. */
  blocked?: string;
  /** Provider spend, when the step called something that costs money. */
  spend?: ProviderSpend;
}

/**
 * Two kinds of step run through the same engine.
 *
 * `ai` steps send a prompt to an AI provider and validate the structured
 * response — the original pattern. `provider` steps call a media provider or
 * the renderer instead, and implement `run` rather than `buildPrompt`/`persist`.
 * Everything else — authority, context, memory, cost, logging, approvals — is
 * identical, because it all still goes through lib/agents/engine.ts.
 */
export interface CapabilityHandler<T = unknown> {
  capability: string;
  label: string;
  mode?: 'ai' | 'provider';
  schemaName: string;
  /** Required for `ai` handlers; unused by `provider` handlers. */
  schema: StructuredSchema<T>;
  buildPrompt?(ctx: RunContext): Promise<string>;
  persist?(ctx: RunContext, data: T): Promise<PersistResult>;
  /** Required for `provider` handlers. */
  run?(ctx: RunContext): Promise<PersistResult>;
}

/** Weighted opportunity score. Competition is inverted at generation time. */
export function opportunityScore(breakdown: OpportunityBreakdown): number {
  const weighted =
    breakdown.demand * 0.28 +
    breakdown.competition * 0.2 +
    breakdown.monetisation * 0.2 +
    breakdown.longevity * 0.14 +
    breakdown.click_potential * 0.18;
  return Math.round(Math.min(100, Math.max(0, weighted)));
}

function baseContext(ctx: RunContext): string {
  return [
    renderBusiness(ctx.business),
    '',
    renderMemory(ctx.memory),
    '',
    ctx.mission ? `Mission: ${ctx.mission.title}\nObjective: ${ctx.mission.objective}` : '',
    '',
    renderPreviousOutputs(ctx.previousOutputs),
    '',
    `Task: ${ctx.task.title}`,
    ctx.task.description ? `Detail: ${ctx.task.description}` : '',
    Object.keys(ctx.task.input).length > 0
      ? `Task input:\n${JSON.stringify(ctx.task.input, null, 2)}`
      : '',
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');
}

/** Operator feedback from a "request changes" decision, if this is a retry. */
function feedbackNote(ctx: RunContext): string {
  const feedback = ctx.task.input.operator_feedback;
  if (typeof feedback !== 'string' || feedback.trim().length === 0) return '';
  return `\n\nThe operator reviewed a previous attempt and asked for changes:\n"${feedback}"\nAddress this directly.`;
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* YouTube: idea generation                                            */
/* ------------------------------------------------------------------ */

const youtubeIdeas: CapabilityHandler<z.infer<typeof youtubeIdeasResponseSchema>> = {
  capability: 'youtube.research.ideas',
  label: 'Generate video ideas',
  schemaName: 'YoutubeIdeas',
  schema: youtubeIdeasResponseSchema,
  async buildPrompt(ctx) {
    const count = Number(ctx.task.input.count ?? 10);
    const niche = String(ctx.task.input.niche ?? ctx.business?.description ?? 'general');
    const audience = String(ctx.task.input.audience ?? 'the channel’s existing audience');
    const extra = String(ctx.task.input.instructions ?? '');
    return [
      baseContext(ctx),
      '',
      `Generate ${count} distinct video opportunities for the niche: ${niche}.`,
      `Target audience: ${audience}.`,
      extra ? `Additional instructions: ${extra}` : '',
      '',
      'Rules:',
      '- Each idea must be genuinely distinct, not a rephrasing of another.',
      '- Score each dimension 0–100. For `competition`, a HIGH score means competition is LOW and the gap is real.',
      '- Do not invent sources or view counts. Leave `sources` empty unless you are citing something you actually know.',
      '- `confidence` is your own confidence in the assessment, between 0 and 1.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const rows = data.ideas.map((idea) => ({
      id: uuid(),
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      channel_id: (ctx.task.input.channel_id as string | undefined) ?? null,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      title: idea.title,
      topic: idea.topic,
      niche: idea.niche,
      summary: idea.summary,
      target_audience: idea.target_audience,
      why_it_might_work: idea.why_it_might_work,
      competition: idea.competition,
      demand: idea.demand,
      monetisation: idea.monetisation,
      longevity: idea.longevity,
      click_potential: idea.click_potential,
      difficulty: idea.difficulty,
      confidence: idea.confidence,
      sources: idea.sources,
      notes: idea.notes,
      score: opportunityScore(idea.breakdown),
      breakdown: idea.breakdown,
      status: 'proposed' as const,
      is_demo: false,
      created_at: now(),
    }));
    await ctx.store.insertMany('youtube_ideas', rows);
    return {
      summary: `discovered ${rows.length} video ${rows.length === 1 ? 'opportunity' : 'opportunities'}`,
      output: { idea_ids: rows.map((r) => r.id), count: rows.length },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: research package                                           */
/* ------------------------------------------------------------------ */

const youtubeResearch: CapabilityHandler<z.infer<typeof youtubeResearchResponseSchema>> = {
  capability: 'youtube.research.package',
  label: 'Build research package',
  schemaName: 'YoutubeResearchPackage',
  schema: youtubeResearchResponseSchema,
  async buildPrompt(ctx) {
    const ideaId = await resolveIdeaId(ctx);
    const idea = ideaId ? await ctx.store.get('youtube_ideas', ideaId) : null;
    return [
      baseContext(ctx),
      '',
      idea
        ? `Build a research package for this approved idea:\nTitle: ${idea.title}\nTopic: ${idea.topic}\nSummary: ${idea.summary}`
        : `Build a research package for: ${ctx.task.title}`,
      '',
      'Rules:',
      '- Never invent a source. If you cannot cite one, set `source` to null.',
      '- Classify each item honestly: "verified" only when you are confident, "interpretation" when you are drawing a conclusion, "needs_verification" when the operator must check it before it goes in a script.',
      '- Put anything contested or commonly misstated into `risks` and `uncertain_claims`.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const ideaId = await resolveIdeaId(ctx);
    const row = {
      id: uuid(),
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      idea_id: ideaId ?? '',
      task_id: ctx.task.id,
      overview: data.overview,
      facts: data.facts,
      statistics: data.statistics,
      timeline: data.timeline,
      viewer_questions: data.viewer_questions,
      competitor_coverage: data.competitor_coverage,
      content_gaps: data.content_gaps,
      hooks: data.hooks,
      interesting_details: data.interesting_details,
      risks: data.risks,
      uncertain_claims: data.uncertain_claims,
      is_demo: false,
      created_at: now(),
    };
    await ctx.store.insert('youtube_research', row);
    const unverified = data.facts.filter((f) => f.confidence !== 'verified').length;
    return {
      summary: `completed a research package — ${data.facts.length} claims, ${unverified} needing verification`,
      output: { research_id: row.id, idea_id: ideaId },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: script                                                     */
/* ------------------------------------------------------------------ */

const youtubeScript: CapabilityHandler<z.infer<typeof youtubeScriptResponseSchema>> = {
  capability: 'youtube.script.write',
  label: 'Write script',
  schemaName: 'YoutubeScript',
  schema: youtubeScriptResponseSchema,
  async buildPrompt(ctx) {
    const targetMinutes = Number(ctx.task.input.target_minutes ?? 16);
    return [
      baseContext(ctx),
      '',
      `Write a documentary script targeting roughly ${targetMinutes} minutes of narration (about ${targetMinutes * 155} words).`,
      '',
      'Structure requirements:',
      '- Open with a hook that works as a cold open. No channel branding, no "welcome back".',
      '- Include at least one pattern interrupt that resets attention part way through.',
      '- End with a payoff that answers the question the hook raised.',
      '- Assert only what the research package supports. Where the research marks something uncertain, phrase it as uncertain.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const ideaId = await resolveIdeaId(ctx);
    const researchId =
      (ctx.previousOutputs.research?.research_id as string | undefined) ??
      (ctx.task.input.research_id as string | undefined) ??
      null;
    const sections = data.sections as ScriptSection[];
    const wordCount = sections.reduce(
      (total, section) => total + section.body.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const scriptId = uuid();
    const timestamp = now();

    await ctx.store.insert('youtube_scripts', {
      id: scriptId,
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      idea_id: ideaId ?? '',
      research_id: researchId,
      task_id: ctx.task.id,
      title: data.title,
      sections,
      word_count: wordCount,
      // 155 words per minute is a realistic documentary narration pace.
      estimated_duration_seconds: Math.round((wordCount / 155) * 60),
      tone: data.tone,
      audience: data.audience,
      goal: data.goal,
      status: 'fact_checking',
      version: 1,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });

    await ctx.store.insert('youtube_script_versions', {
      id: uuid(),
      script_id: scriptId,
      version: 1,
      sections,
      note: 'Initial draft',
      created_at: timestamp,
    });

    return {
      summary: `completed a ${wordCount.toLocaleString('en-GB')}-word script — "${data.title}"`,
      output: { script_id: scriptId, word_count: wordCount, idea_id: ideaId },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: script revision                                            */
/* ------------------------------------------------------------------ */

const youtubeScriptRevise: CapabilityHandler<z.infer<typeof youtubeScriptResponseSchema>> = {
  capability: 'youtube.script.revise',
  label: 'Revise script',
  schemaName: 'YoutubeScript',
  schema: youtubeScriptResponseSchema,
  async buildPrompt(ctx) {
    const scriptId = resolveScriptId(ctx);
    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    if (!script) throw new Error('No script was supplied to revise.');
    const instruction = String(ctx.task.input.instruction ?? 'Improve the script.');
    const sectionKey = ctx.task.input.section_heading;

    return [
      baseContext(ctx),
      '',
      'Revise the script below.',
      typeof sectionKey === 'string'
        ? `Focus on the section titled "${sectionKey}". Return the whole script, with every other section unchanged.`
        : 'Return the whole script.',
      `Instruction: ${instruction}`,
      '',
      '```json',
      JSON.stringify(
        { title: script.title, tone: script.tone, sections: script.sections },
        null,
        2,
      ).slice(0, 20_000),
      '```',
      '',
      'Rules:',
      '- Keep the same factual content unless the instruction is to correct something.',
      '- Do not drop sections. The section `kind` values must stay valid.',
    ].join('\n');
  },
  async persist(ctx, data) {
    const scriptId = resolveScriptId(ctx);
    if (!scriptId) throw new Error('No script id on the revision task.');
    const script = await ctx.store.get('youtube_scripts', scriptId);
    if (!script) throw new Error('The script being revised no longer exists.');

    const sections = data.sections as ScriptSection[];
    const wordCount = sections.reduce(
      (total, section) => total + section.body.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const version = script.version + 1;
    const timestamp = now();

    await ctx.store.update('youtube_scripts', scriptId, {
      title: data.title,
      sections,
      word_count: wordCount,
      estimated_duration_seconds: Math.round((wordCount / 155) * 60),
      tone: data.tone,
      version,
      // A revision invalidates the previous fact check.
      status: 'draft',
      updated_at: timestamp,
    });

    await ctx.store.insert('youtube_script_versions', {
      id: uuid(),
      script_id: scriptId,
      version,
      sections,
      note: String(ctx.task.input.instruction ?? 'Revision'),
      created_at: timestamp,
    });

    return {
      summary: `revised "${data.title}" to v${version} (${wordCount.toLocaleString('en-GB')} words)`,
      output: { script_id: scriptId, version, word_count: wordCount },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: fact check                                                 */
/* ------------------------------------------------------------------ */

const youtubeFactCheck: CapabilityHandler<z.infer<typeof factCheckResponseSchema>> = {
  capability: 'youtube.script.factcheck',
  label: 'Fact check script',
  schemaName: 'FactCheck',
  schema: factCheckResponseSchema,
  async buildPrompt(ctx) {
    const scriptId = resolveScriptId(ctx);
    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    const body = script
      ? script.sections.map((s) => `## ${s.heading}\n${s.body}`).join('\n\n')
      : '(script unavailable)';
    return [
      baseContext(ctx),
      '',
      'Check every factual claim in the script below.',
      '',
      '```',
      body.slice(0, 20_000),
      '```',
      '',
      'Rules:',
      '- Extract claims verbatim enough that the operator can find them in the script.',
      '- "verified" means you are confident it is correct. "unsourced" means plausible but uncited. "potentially_incorrect" means you believe it is wrong — use it sparingly and explain why.',
      '- Rhetorical or subjective statements are not claims. Skip them.',
      '- Where a claim is wrong or overstated, supply a `suggested_correction`.',
    ].join('\n');
  },
  async persist(ctx, data) {
    const scriptId = resolveScriptId(ctx);
    const incorrect = data.findings.filter((f) => f.verdict === 'potentially_incorrect');
    const passed = incorrect.length === 0;
    const id = uuid();

    await ctx.store.insert('youtube_fact_checks', {
      id,
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      script_id: scriptId ?? '',
      task_id: ctx.task.id,
      findings: data.findings,
      passed,
      summary: data.summary,
      is_demo: false,
      created_at: now(),
    });

    if (scriptId) {
      await ctx.store.update('youtube_scripts', scriptId, {
        status: passed ? 'awaiting_approval' : 'draft',
        updated_at: now(),
      });
    }

    if (!passed) {
      return {
        summary: `flagged ${incorrect.length} potentially incorrect ${incorrect.length === 1 ? 'claim' : 'claims'}`,
        output: { fact_check_id: id, passed, script_id: scriptId, findings: data.findings.length },
        blocked: `${incorrect.length} claim(s) marked potentially incorrect. The script cannot progress until they are resolved.`,
      };
    }

    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    const needsReview = data.findings.filter((f) => f.verdict === 'needs_review').length;
    const unsourced = data.findings.filter((f) => f.verdict === 'unsourced').length;
    const warnings = [
      needsReview > 0 ? `${needsReview} claim(s) need review` : '',
      unsourced > 0 ? `${unsourced} claim(s) are unsourced` : '',
    ].filter(Boolean);

    return {
      summary: `verified the script — ${data.findings.length} claims checked, none flagged as incorrect`,
      output: { fact_check_id: id, passed, script_id: scriptId, findings: data.findings.length },
      // The gate the whole production pipeline waits behind. It carries
      // everything the operator needs to decide without leaving the screen.
      approval: {
        kind: 'script',
        title: `Approve script: ${script?.title ?? ctx.task.title}`,
        summary:
          `${script ? `${script.word_count.toLocaleString('en-GB')} words, about ${Math.round(script.estimated_duration_seconds / 60)} minutes. ` : ''}` +
          `${data.findings.length} claims checked, none flagged as incorrect. ` +
          `${warnings.length > 0 ? `Outstanding: ${warnings.join('; ')}.` : 'No outstanding warnings.'} ` +
          `Production does not begin until you approve.`,
        payload: {
          script_id: scriptId,
          fact_check_id: id,
          title: script?.title ?? null,
          word_count: script?.word_count ?? null,
          estimated_duration_seconds: script?.estimated_duration_seconds ?? null,
          findings: data.findings.length,
          warnings,
        },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: thumbnails                                                 */
/* ------------------------------------------------------------------ */

const youtubeThumbnails: CapabilityHandler<z.infer<typeof thumbnailPlanResponseSchema>> = {
  capability: 'youtube.thumbnail.concepts',
  label: 'Thumbnail concepts',
  schemaName: 'ThumbnailPlan',
  schema: thumbnailPlanResponseSchema,
  async buildPrompt(ctx) {
    const scriptId = resolveScriptId(ctx);
    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    return [
      baseContext(ctx),
      '',
      script ? `Video title: ${script.title}\nGoal: ${script.goal}` : '',
      script ? `Hook: ${script.sections.find((s) => s.kind === 'hook')?.body.slice(0, 600) ?? ''}` : '',
      '',
      'Produce three to five thumbnail concepts and at least three alternative titles.',
      '',
      'Rules:',
      '- One subject and one emotion per concept. Text must stay legible at 210×118 pixels, so four words is the practical ceiling.',
      '- `click_psychology` must name the specific curiosity or tension the thumbnail creates — not "it looks good".',
      '- `contrast_strategy` should say how the subject separates from the background at small sizes.',
      '- `image_prompt` must be usable as-is by an image generation model, and must not request a recognisable real person.',
      '- Do not promise something the video does not deliver.',
      '- `recommended_pairings` indexes into your own arrays.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const scriptId = resolveScriptId(ctx);
    const video = await resolveVideo(ctx);
    const videoId = video?.id ?? null;
    const rows = data.concepts.map((concept) => ({
      id: uuid(),
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      video_id: videoId,
      script_id: scriptId,
      concept_title: concept.concept_title,
      visual_description: concept.visual_description,
      subject: concept.subject,
      background: concept.background,
      composition: concept.composition,
      text: concept.text_overlay,
      emotion: concept.facial_expression || 'n/a',
      colour_direction: concept.contrast_strategy,
      contrast_strategy: concept.contrast_strategy,
      click_psychology: concept.click_psychology,
      image_prompt: concept.image_prompt,
      confidence: concept.confidence,
      reasoning: concept.click_psychology,
      // No candidate image exists until an image provider produces one.
      asset_id: null,
      selected: false,
      is_demo: false,
      created_at: now(),
    }));
    await ctx.store.insertMany('youtube_thumbnail_concepts', rows);

    if (videoId) {
      await ctx.store.update('youtube_videos', videoId, {
        alternative_titles: data.title_suggestions,
        updated_at: now(),
      });
    }

    return {
      summary: `produced ${rows.length} thumbnail concepts and ${data.title_suggestions.length} alternative titles`,
      output: {
        concept_ids: rows.map((r) => r.id),
        alternative_titles: data.title_suggestions,
        recommended_pairings: data.recommended_pairings,
        video_id: videoId,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: production plan                                            */
/* ------------------------------------------------------------------ */

const youtubeProduction: CapabilityHandler<z.infer<typeof productionPlanResponseSchema>> = {
  capability: 'youtube.production.plan',
  label: 'Production plan',
  schemaName: 'ProductionPlan',
  schema: productionPlanResponseSchema,
  async buildPrompt(ctx) {
    const scriptId = resolveScriptId(ctx);
    const script = scriptId ? await ctx.store.get('youtube_scripts', scriptId) : null;
    const body = script
      ? script.sections.map((s) => `## ${s.heading}\n${s.body}`).join('\n\n')
      : '(script unavailable)';
    return [
      baseContext(ctx),
      '',
      'Break this approved script into production scenes.',
      '',
      '```',
      body.slice(0, 20_000),
      '```',
      '',
      'Rules:',
      '- Each scene runs 8–25 seconds. Narration must be taken from the script, not rewritten.',
      '- `b_roll_query` is a literal stock-footage search string.',
      '- `image_prompt` and `video_prompt` should be usable as-is by a generation provider.',
      '- No scene may depend on footage that would need to be filmed.',
    ].join('\n');
  },
  async persist(ctx, data) {
    const videoId = (ctx.task.input.video_id as string | undefined) ?? null;
    if (!videoId) {
      return {
        summary: `drafted a ${data.scenes.length}-scene production plan`,
        output: { scenes: data.scenes.length, scenes_data: data.scenes },
      };
    }
    let elapsed = 0;
    const rows = data.scenes.map((scene) => {
      const row = newScene({
        video_id: videoId,
        business_id: ctx.business?.id ?? ctx.task.business_id ?? null,
        mission_id: ctx.task.mission_id,
        scene_number: scene.scene_number,
        start_time_estimate: elapsed,
        duration_seconds: scene.duration_seconds,
        narration: scene.narration,
        visual_direction: scene.visual_direction,
        b_roll_query: scene.b_roll_query,
        image_prompt: scene.image_prompt,
        video_prompt: scene.video_prompt,
        on_screen_text: scene.on_screen_text,
        transition: scene.transition,
        // Assets are pending until a media provider actually produces them.
        asset_status: 'pending' as const,
        status: 'awaiting_asset' as const,
      });
      elapsed += scene.duration_seconds;
      return row;
    });
    await ctx.store.insertMany('youtube_scenes', rows);
    const total = data.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

    return {
      summary: `built a ${rows.length}-scene production plan (~${Math.round(total / 60)} minutes)`,
      output: { scene_count: rows.length, total_seconds: total, video_id: videoId },
      approval: {
        kind: 'video',
        title: 'Production plan ready',
        summary: `${rows.length} scenes, roughly ${Math.round(total / 60)} minutes. All assets are pending — nothing has been generated or purchased.`,
        payload: { video_id: videoId, scene_count: rows.length },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* YouTube: channel analysis                                           */
/* ------------------------------------------------------------------ */

const youtubeAnalysis: CapabilityHandler<z.infer<typeof channelAnalysisResponseSchema>> = {
  capability: 'youtube.analytics.analyse',
  label: 'Analyse channel performance',
  schemaName: 'ChannelAnalysis',
  schema: channelAnalysisResponseSchema,
  async buildPrompt(ctx) {
    const businessId = ctx.business?.id ?? ctx.task.business_id;
    const analytics = businessId
      ? await ctx.store.list('youtube_analytics', { where: { business_id: businessId } })
      : [];
    const videos = businessId
      ? await ctx.store.list('youtube_videos', { where: { business_id: businessId } })
      : [];
    const titleById = new Map(videos.map((v) => [v.id, v.title]));
    const rows = analytics.map((a) => ({
      title: a.video_id ? (titleById.get(a.video_id) ?? 'Unknown') : 'Channel total',
      views: a.views,
      ctr: a.ctr,
      avg_view_duration_s: a.average_view_duration_seconds,
      subs: a.subscribers_gained,
      revenue: a.revenue,
      date: a.date,
    }));
    return [
      baseContext(ctx),
      '',
      'Analyse the recorded performance below and identify what actually works.',
      '',
      '```json',
      JSON.stringify(rows, null, 2).slice(0, 16_000),
      '```',
      '',
      'Rules:',
      `- There are ${rows.length} rows. If that is too few to support a conclusion, say so in \`caveats\` rather than asserting a pattern.`,
      '- Separate observation from recommendation.',
      '- Do not use any number that is not in the data above.',
    ].join('\n');
  },
  async persist(ctx, data) {
    const businessId = ctx.business?.id ?? ctx.task.business_id ?? '';
    const id = uuid();
    await ctx.store.insert('youtube_channel_intelligence', {
      id,
      business_id: businessId,
      channel_id: (ctx.task.input.channel_id as string | undefined) ?? null,
      best_topics: data.best_topics,
      best_title_structures: data.best_title_structures,
      thumbnail_patterns: data.thumbnail_patterns,
      ideal_duration: data.ideal_duration,
      retention_trends: data.retention_trends,
      best_publishing_periods: data.best_publishing_periods,
      generated_at: now(),
      is_demo: false,
    });
    return {
      summary: 'refreshed channel intelligence from recorded analytics',
      output: { intelligence_id: id, caveats: data.caveats },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Etsy                                                                */
/* ------------------------------------------------------------------ */

const etsyOpportunities: CapabilityHandler<
  z.infer<typeof etsyOpportunitiesResponseSchema>
> = {
  capability: 'etsy.research.opportunities',
  label: 'Find product opportunities',
  schemaName: 'EtsyOpportunities',
  schema: etsyOpportunitiesResponseSchema,
  async buildPrompt(ctx) {
    const count = Number(ctx.task.input.count ?? 6);
    return [
      baseContext(ctx),
      '',
      `Find ${count} digital product opportunities for this shop.`,
      '',
      'Rules:',
      '- Digital products only — instant download, no physical fulfilment.',
      '- Score 0–100 per dimension. For `competition`, a HIGH score means competition is LOW.',
      '- Give a realistic `pricing_range` in pounds sterling.',
      '- Be honest about `production_difficulty`. A 60-page pack is not a quick win.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const rows = data.opportunities.map((opp) => ({
      id: uuid(),
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      store_id: (ctx.task.input.store_id as string | undefined) ?? null,
      mission_id: ctx.task.mission_id,
      task_id: ctx.task.id,
      product: opp.product,
      target_customer: opp.target_customer,
      problem: opp.problem,
      demand: opp.demand,
      competition: opp.competition,
      pricing_range: opp.pricing_range,
      seasonality: opp.seasonality,
      production_difficulty: opp.production_difficulty,
      seo_opportunity: opp.seo_opportunity,
      market_gap: opp.market_gap,
      profit_potential: opp.profit_potential,
      score: opportunityScore(opp.breakdown),
      breakdown: opp.breakdown,
      status: 'proposed' as const,
      is_demo: false,
      created_at: now(),
    }));
    await ctx.store.insertMany('etsy_opportunities', rows);
    return {
      summary: `found ${rows.length} product ${rows.length === 1 ? 'opportunity' : 'opportunities'}`,
      output: { opportunity_ids: rows.map((r) => r.id), count: rows.length },
    };
  },
};

const etsyListing: CapabilityHandler<z.infer<typeof etsyListingResponseSchema>> = {
  capability: 'etsy.listing.write',
  label: 'Draft listing',
  schemaName: 'EtsyListing',
  schema: etsyListingResponseSchema,
  async buildPrompt(ctx) {
    const productId = (ctx.task.input.product_id as string | undefined) ?? null;
    const product = productId ? await ctx.store.get('etsy_products', productId) : null;
    return [
      baseContext(ctx),
      '',
      product
        ? `Product: ${product.name}\n${product.description}\nTarget buyer: ${product.target_buyer}\nPrice: £${product.price}`
        : `Draft a listing for: ${ctx.task.title}`,
      '',
      'Rules:',
      '- The title must read naturally to a human while carrying the primary keyword in the first sixty characters.',
      '- Exactly thirteen tags, each under twenty characters, none cannibalising another.',
      '- Lead the description with the buyer outcome, not the file format.',
      '- State plainly that this is an instant digital download.',
      feedbackNote(ctx),
    ].join('\n');
  },
  async persist(ctx, data) {
    const productId = (ctx.task.input.product_id as string | undefined) ?? null;
    const id = uuid();
    await ctx.store.insert('etsy_listings', {
      id,
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      product_id: productId ?? '',
      task_id: ctx.task.id,
      title: data.title,
      description: data.description,
      tags: data.tags,
      keywords: data.keywords,
      category_suggestions: data.category_suggestions,
      price_suggestion: data.price_suggestion,
      benefits: data.benefits,
      faq: data.faq,
      image_brief: data.image_brief,
      status: 'awaiting_approval',
      is_demo: false,
      created_at: now(),
    });
    if (productId) {
      await ctx.store.update('etsy_products', productId, {
        status: 'awaiting_approval',
        updated_at: now(),
      });
    }
    return {
      summary: `drafted a listing — "${data.title.slice(0, 60)}…"`,
      output: { listing_id: id, product_id: productId },
      approval: {
        kind: 'listing',
        title: 'Etsy listing ready',
        summary: `"${data.title}" is drafted with ${data.tags.length} tags. Nothing is published until you approve it.`,
        payload: { listing_id: id },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

const seoKeywords: CapabilityHandler<z.infer<typeof keywordResponseSchema>> = {
  capability: 'seo.keywords',
  label: 'Keyword research',
  schemaName: 'Keywords',
  schema: keywordResponseSchema,
  async buildPrompt(ctx) {
    const subject = String(ctx.task.input.subject ?? ctx.task.title);
    return [
      baseContext(ctx),
      '',
      `Research search keywords for: ${subject}`,
      '',
      'Rules:',
      '- Favour long-tail phrases with clear buyer or viewer intent over broad head terms.',
      '- You do not have live search-volume data. Give a qualitative band ("High", "Moderate", "Low") and never a fabricated number.',
      '- `relevance` is 0–1, how closely the phrase matches what is actually being sold or covered.',
    ].join('\n');
  },
  async persist(ctx, data) {
    const rows = data.keywords.map((k) => ({
      id: uuid(),
      business_id: ctx.business?.id ?? ctx.task.business_id ?? '',
      keyword: k.keyword,
      search_volume: k.search_volume,
      competition: k.competition,
      relevance: k.relevance,
      is_demo: false,
      created_at: now(),
    }));
    await ctx.store.insertMany('etsy_keywords', rows);
    return {
      summary: `delivered ${rows.length} keywords`,
      output: { keyword_ids: rows.map((r) => r.id), keywords: rows.map((r) => r.keyword) },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const HANDLERS: CapabilityHandler<never>[] = [
  ...PRODUCTION_HANDLERS,
  ...ISLAMIC_HANDLERS,
  youtubeIdeas,
  youtubeResearch,
  youtubeScript,
  youtubeScriptRevise,
  youtubeFactCheck,
  youtubeThumbnails,
  youtubeProduction,
  youtubeAnalysis,
  etsyOpportunities,
  etsyListing,
  seoKeywords,
] as unknown as CapabilityHandler<never>[];

export function getCapabilityHandler(
  capability: string,
): CapabilityHandler<unknown> | undefined {
  return HANDLERS.find((h) => h.capability === capability) as
    | CapabilityHandler<unknown>
    | undefined;
}

export function listCapabilities(): { capability: string; label: string }[] {
  return HANDLERS.map((h) => ({ capability: h.capability, label: h.label }));
}

/* ------------------------------------------------------------------ */
/* Shared resolution helpers                                           */
/* ------------------------------------------------------------------ */

async function resolveIdeaId(ctx: RunContext): Promise<string | null> {
  const direct = ctx.task.input.idea_id;
  if (typeof direct === 'string') return direct;
  const fromStep = ctx.previousOutputs.research?.idea_id;
  if (typeof fromStep === 'string') return fromStep;
  const ids = ctx.previousOutputs.ideas?.idea_ids;
  if (Array.isArray(ids) && typeof ids[0] === 'string') return ids[0];
  return null;
}

function resolveScriptId(ctx: RunContext): string | null {
  const direct = ctx.task.input.script_id;
  if (typeof direct === 'string') return direct;
  const fromStep = ctx.previousOutputs.script?.script_id;
  if (typeof fromStep === 'string') return fromStep;
  return null;
}
