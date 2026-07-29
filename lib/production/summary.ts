import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import type { YoutubeScene, YoutubeVideo } from '@/types/domain';
import type {
  MediaAsset,
  ProductionStage,
  YoutubeMetadata,
  YoutubeQualityCheck,
  YoutubeTimeline,
  YoutubeVoiceover,
} from '@/types/production';
import { PRODUCTION_STAGES } from '@/types/production';

export type StageState = 'done' | 'active' | 'blocked' | 'pending' | 'skipped';

export interface StageView {
  stage: ProductionStage;
  label: string;
  state: StageState;
  /** The task backing this stage, when one exists. */
  taskId: string | null;
  detail: string;
}

export interface CostBreakdown {
  research_and_writing: number;
  voice: number;
  images: number;
  video: number;
  rendering: number;
  other: number;
  total: number;
}

export interface ProductionSummary {
  video: YoutubeVideo;
  scenes: YoutubeScene[];
  assets: MediaAsset[];
  voiceover: YoutubeVoiceover | null;
  timeline: YoutubeTimeline | null;
  metadata: YoutubeMetadata | null;
  qualityCheck: YoutubeQualityCheck | null;
  stages: StageView[];
  cost: CostBreakdown;
  /** True when any asset in the package is a Demo Mode placeholder. */
  containsSimulated: boolean;
}

const STAGE_LABELS: Record<ProductionStage, string> = {
  ideas: 'Idea',
  research: 'Research',
  script: 'Script',
  fact_check: 'Fact check',
  script_approval: 'Script approval',
  voiceover: 'Voiceover',
  visual_plan: 'Visual plan',
  assets: 'Assets',
  thumbnail: 'Thumbnail',
  metadata: 'Metadata',
  assembly: 'Assembly',
  quality_check: 'Quality check',
  final_approval: 'Final approval',
  publish: 'Publish',
};

/** Maps workflow step keys onto pipeline stages for the progress display. */
const STEP_TO_STAGE: Record<string, ProductionStage> = {
  ideas: 'ideas',
  research: 'research',
  script: 'script',
  fact_check: 'fact_check',
  voiceover_plan: 'voiceover',
  voiceover: 'voiceover',
  visual_plan: 'visual_plan',
  assets: 'assets',
  thumbnail_concepts: 'thumbnail',
  thumbnail_images: 'thumbnail',
  metadata: 'metadata',
  assembly: 'assembly',
  quality_check: 'quality_check',
};

/**
 * Everything needed to show one video's production state, computed from real
 * records — no stage is reported done because a counter says so.
 */
export async function buildProductionSummary(
  store: DataStore,
  ownerId: string,
  videoId: string,
): Promise<ProductionSummary | null> {
  const video = await store.get('youtube_videos', videoId);
  if (!video) return null;

  const [scenes, assets, voiceovers, timelines, metadataRows, qualityChecks, transactions, tasks, approvals] =
    await Promise.all([
      store.list('youtube_scenes', { where: { video_id: videoId } }),
      store.list('media_assets', { where: { video_id: videoId } }),
      store.list('youtube_voiceovers', { where: { business_id: video.business_id } }),
      store.list('youtube_timelines', { where: { video_id: videoId } }),
      store.list('youtube_metadata', { where: { video_id: videoId } }),
      store.list('youtube_quality_checks', { where: { video_id: videoId } }),
      store.list('financial_transactions', { where: { owner_id: ownerId } }),
      video.mission_id
        ? store.list('tasks', { where: { mission_id: video.mission_id } })
        : Promise.resolve([]),
      store.list('approvals', { where: { owner_id: ownerId } }),
    ]);

  const voiceover =
    voiceovers.find((v) => v.id === video.voiceover_id) ??
    voiceovers.find((v) => v.video_id === videoId) ??
    null;
  const timeline = timelines.find((t) => t.id === video.timeline_id) ?? timelines[0] ?? null;
  const metadata = metadataRows.find((m) => m.selected) ?? metadataRows[0] ?? null;
  const qualityCheck =
    qualityChecks.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const currentIndex = PRODUCTION_STAGES.indexOf(video.stage);
  const stages: StageView[] = PRODUCTION_STAGES.map((stage, index) => {
    const task = tasks.find((t) => t.step_key && STEP_TO_STAGE[t.step_key] === stage) ?? null;

    let state: StageState;
    if (video.status === 'blocked' && index === currentIndex) state = 'blocked';
    else if (stage === 'publish') {
      state = video.published_external_id
        ? 'done'
        : video.status === 'ready'
          ? 'active'
          : 'pending';
    } else if (index < currentIndex) state = 'done';
    else if (index === currentIndex) state = 'active';
    else state = 'pending';

    return {
      stage,
      label: STAGE_LABELS[stage],
      state,
      taskId: task?.id ?? null,
      detail: describeStage(stage, {
        video,
        scenes,
        assets,
        voiceover,
        qualityCheck,
        metadata,
        // Scoped to this video: another video's pending approval must not
        // make this one look like it is waiting.
        pendingApproval: approvals.some(
          (a) =>
            a.status === 'pending' &&
            ((stage === 'script_approval' &&
              a.kind === 'script' &&
              a.payload.script_id === video.script_id) ||
              (stage === 'final_approval' &&
                a.kind === 'video' &&
                a.payload.video_id === video.id)),
        ),
      }),
    };
  });

  return {
    video,
    scenes: scenes.slice().sort((a, b) => a.scene_number - b.scene_number),
    assets,
    voiceover,
    timeline,
    metadata,
    qualityCheck,
    stages,
    cost: buildCostBreakdown(transactions, assets, tasks.map((t) => t.id)),
    containsSimulated: assets.some((a) => a.simulated),
  };
}

function describeStage(
  stage: ProductionStage,
  data: {
    video: YoutubeVideo;
    scenes: YoutubeScene[];
    assets: MediaAsset[];
    voiceover: YoutubeVoiceover | null;
    qualityCheck: YoutubeQualityCheck | null;
    metadata: YoutubeMetadata | null;
    pendingApproval: boolean;
  },
): string {
  switch (stage) {
    case 'script_approval':
      return data.pendingApproval ? 'Waiting on you' : '';
    case 'voiceover':
      return data.voiceover?.audio_duration
        ? `${Math.round(data.voiceover.audio_duration)}s of narration`
        : data.voiceover
          ? `${data.voiceover.segments.length} segments planned`
          : '';
    case 'visual_plan':
      return data.scenes.length > 0 ? `${data.scenes.length} scenes` : '';
    case 'assets': {
      if (data.scenes.length === 0) return '';
      const ready = data.scenes.filter((s) => s.asset_id).length;
      return `${ready} / ${data.scenes.length} sourced`;
    }
    case 'thumbnail':
      return data.video.thumbnail_asset_id
        ? 'Selected'
        : `${data.assets.filter((a) => a.type === 'thumbnail').length} candidates`;
    case 'metadata':
      return data.metadata ? `${data.metadata.tags.length} tags` : '';
    case 'assembly': {
      const final = data.assets.find((a) => a.type === 'final_video');
      return final?.duration ? `${Math.round(final.duration)}s rendered` : '';
    }
    case 'quality_check':
      return data.qualityCheck
        ? `${data.qualityCheck.verdict.toUpperCase()} · ${data.qualityCheck.issues.length} issues`
        : '';
    case 'final_approval':
      return data.pendingApproval ? 'Waiting on you' : '';
    case 'publish':
      return data.video.published_external_id
        ? 'Published'
        : data.video.status === 'ready'
          ? 'Ready to publish'
          : '';
    default:
      return '';
  }
}

/**
 * Splits recorded spend into the categories an operator thinks in. Only
 * transactions genuinely attributed to this video's tasks are counted.
 */
export function buildCostBreakdown(
  transactions: { kind: string; category: string; amount: number; reference_type: string | null; reference_id: string | null }[],
  assets: MediaAsset[],
  taskIds: string[],
): CostBreakdown {
  const ids = new Set(taskIds);
  const relevant = transactions.filter(
    (t) =>
      t.kind === 'ai_cost' &&
      t.reference_type === 'task' &&
      t.reference_id &&
      ids.has(t.reference_id),
  );

  const breakdown: CostBreakdown = {
    research_and_writing: 0,
    voice: 0,
    images: 0,
    video: 0,
    rendering: 0,
    other: 0,
    total: 0,
  };

  for (const transaction of relevant) {
    const category = transaction.category.toLowerCase();
    if (category.includes('speech') || category.includes('voice')) {
      breakdown.voice += transaction.amount;
    } else if (category.includes('thumbnail') || category.includes('image')) {
      breakdown.images += transaction.amount;
    } else if (category.includes('video') || category.includes('clip')) {
      breakdown.video += transaction.amount;
    } else if (category.includes('render') || category.includes('ffmpeg')) {
      breakdown.rendering += transaction.amount;
    } else if (category.startsWith('claude') || category.includes('gpt') || category.includes('gemini')) {
      breakdown.research_and_writing += transaction.amount;
    } else {
      breakdown.other += transaction.amount;
    }
  }

  // Asset generation cost is recorded on the asset too; use it where the
  // transaction categories were not specific enough.
  const assetVoice = assets
    .filter((a) => a.type === 'voiceover')
    .reduce((sum, a) => sum + a.generation_cost, 0);
  const assetImages = assets
    .filter((a) => a.type === 'image' || a.type === 'thumbnail')
    .reduce((sum, a) => sum + a.generation_cost, 0);
  const assetVideo = assets
    .filter((a) => a.type === 'video_clip')
    .reduce((sum, a) => sum + a.generation_cost, 0);

  breakdown.voice = Math.max(breakdown.voice, assetVoice);
  breakdown.images = Math.max(breakdown.images, assetImages);
  breakdown.video = Math.max(breakdown.video, assetVideo);

  breakdown.total =
    breakdown.research_and_writing +
    breakdown.voice +
    breakdown.images +
    breakdown.video +
    breakdown.rendering +
    breakdown.other;

  for (const key of Object.keys(breakdown) as (keyof CostBreakdown)[]) {
    breakdown[key] = Number(breakdown[key].toFixed(4));
  }
  return breakdown;
}
