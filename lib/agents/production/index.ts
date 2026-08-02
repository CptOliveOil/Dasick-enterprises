import type { CapabilityHandler } from '@/lib/agents/capabilities';
import { assetGenerate } from './assets';
import { videoAssemble } from './assemble';
import { qualityCheck, videoMetadata } from './quality';
import { thumbnailGenerate } from './thumbnails';
import { visualPlan } from './visuals';
import { voiceoverGenerate, voiceoverPlan } from './voiceover';
import {
  analyticsCollect,
  copyrightReview,
  subtitleGenerate,
  youtubePublish,
} from './studio';

/**
 * Production capabilities, registered with the same registry the original
 * capabilities use. They run through lib/agents/engine.ts like everything else.
 */
export const PRODUCTION_HANDLERS: CapabilityHandler<never>[] = [
  voiceoverPlan,
  voiceoverGenerate,
  visualPlan,
  assetGenerate,
  thumbnailGenerate,
  videoMetadata,
  videoAssemble,
  subtitleGenerate,
  copyrightReview,
  qualityCheck,
  youtubePublish,
  analyticsCollect,
] as unknown as CapabilityHandler<never>[];
