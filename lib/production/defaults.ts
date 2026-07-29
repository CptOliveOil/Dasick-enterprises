import { uuid } from '@/lib/ids';
import type { AssetStatus, YoutubeScene, YoutubeVideo } from '@/types/domain';
import type {
  AssetStrategy,
  ProductionBudget,
  ProductionSettings,
  ProductionStage,
  SceneStatus,
  VisualType,
} from '@/types/production';

/** Words per minute used to turn narration length into a duration estimate. */
export const NARRATION_WPM = 155;

export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round((words / NARRATION_WPM) * 60));
}

/**
 * Scene and video rows gained a lot of production fields. These factories keep
 * every creation site consistent and stop a missing default from silently
 * becoming `undefined` in the database.
 */
export function newScene(
  input: Partial<YoutubeScene> & { video_id: string; scene_number: number },
): YoutubeScene {
  return {
    id: uuid(),
    business_id: null,
    mission_id: null,
    start_time_estimate: 0,
    duration_seconds: 8,
    narration: '',
    visual_type: 'image' as VisualType,
    visual_direction: '',
    b_roll_query: '',
    image_prompt: '',
    video_prompt: '',
    on_screen_text: '',
    animation_notes: '',
    transition: 'cut',
    importance: 3,
    asset_strategy: 'generated_image' as AssetStrategy,
    asset_status: 'pending' as AssetStatus,
    asset_id: null,
    status: 'planned' as SceneStatus,
    error: null,
    is_demo: false,
    ...input,
  };
}

export function newVideo(
  input: Partial<YoutubeVideo> & { business_id: string; number: number; title: string },
): YoutubeVideo {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    channel_id: null,
    idea_id: null,
    script_id: null,
    mission_id: null,
    status: 'idea',
    stage: 'ideas' as ProductionStage,
    blocked_reason: null,
    alternative_titles: [],
    selected_thumbnail_id: null,
    thumbnail_asset_id: null,
    final_asset_id: null,
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
    ...input,
  };
}

/**
 * Budgets an operator has not configured yet. Deliberately conservative: the
 * approval threshold is low enough that the first expensive run stops for a
 * human rather than surprising them.
 */
export function defaultBudget(
  ownerId: string,
  businessId: string,
  currency = 'GBP',
): ProductionBudget {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: ownerId,
    business_id: businessId,
    currency,
    max_cost_per_video: 25,
    max_image_spend: 10,
    max_video_spend: 12,
    max_voice_spend: 5,
    approval_threshold: 5,
    concurrency: 3,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function defaultProductionSettings(
  ownerId: string,
  businessId: string,
  channelId: string | null = null,
): ProductionSettings {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: ownerId,
    business_id: businessId,
    channel_id: channelId,
    voice_provider: '',
    voice_id: '',
    voice_name: '',
    voice_speed: 1,
    language: 'en-GB',
    narration_style: 'Calm, authoritative documentary narration',
    width: 1920,
    height: 1080,
    fps: 30,
    captions_enabled: true,
    burn_in_captions: false,
    music_mode: 'none',
    music_asset_id: null,
    music_volume: 0.12,
    music_fade_in: 2,
    music_fade_out: 3,
    // Publishing is an external action. It stays off until deliberately enabled.
    auto_publish_after_approval: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}
