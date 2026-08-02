import 'server-only';
import { config } from '@/lib/config';
import { currentMode, simulationAllowed as modeAllowsSimulation, type Mode } from '@/lib/modes';
import { FfmpegRenderer } from './ffmpeg-renderer';
import {
  SimulatedImageProvider,
  SimulatedStockProvider,
  SimulatedVideoProvider,
  SimulatedVoiceProvider,
} from './simulated';
import {
  SimulatedAnalyticsProvider,
  SimulatedMusicProvider,
  SimulatedPublisher,
  SimulatedSubtitleProvider,
} from './studio-simulated';
import {
  UnconnectedAnalyticsProvider,
  UnconnectedImageProvider,
  UnconnectedMusicProvider,
  UnconnectedPublisher,
  UnconnectedStockProvider,
  UnconnectedSubtitleProvider,
  UnconnectedVideoProvider,
  UnconnectedVoiceProvider,
} from './unconnected';
import { ElevenLabsVoiceProvider, elevenLabsConfigured } from './elevenlabs';
import { OpenAiImageProvider, openAiImagesConfigured } from './openai-images';
import { OpenverseStockProvider, openverseConfigured } from './openverse';
import { YouTubeAnalyticsProvider, YouTubePublisher, youtubeConfigured } from './youtube';
import type {
  AnalyticsProvider,
  ImageProvider,
  MusicProvider,
  ProviderDescriptor,
  Publisher,
  StockMediaProvider,
  SubtitleProvider,
  VideoProvider,
  VideoRenderer,
  VoiceProvider,
} from './types';

export const VOICE_ENV = ['VOICE_PROVIDER', 'VOICE_PROVIDER_API_KEY'];
export const IMAGE_ENV = ['IMAGE_PROVIDER', 'IMAGE_PROVIDER_API_KEY'];
export const VIDEO_ENV = ['VIDEO_PROVIDER', 'VIDEO_PROVIDER_API_KEY'];
export const STOCK_ENV = ['STOCK_PROVIDER', 'STOCK_PROVIDER_API_KEY'];
export const MUSIC_ENV = ['MUSIC_PROVIDER', 'MUSIC_PROVIDER_API_KEY'];
export const SUBTITLE_ENV = ['SUBTITLE_PROVIDER', 'SUBTITLE_PROVIDER_API_KEY'];
export const PUBLISHER_ENV = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];
export const ANALYTICS_ENV = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'];

/**
 * Whether a simulated provider may stand in for a missing real one.
 *
 * The mode decides. Demo and Development may simulate; Production never may,
 * so a missing provider there blocks the step with its reason rather than
 * quietly producing a placeholder that looks like work.
 */
export function simulationAllowed(mode: Mode = currentMode()): boolean {
  return modeAllowsSimulation(mode);
}

/**
 * Whether a real, billable adapter may be used at all.
 *
 * Demo Mode is defined as "nothing can be spent, no external call is made", so
 * a demo workspace that happens to have an ElevenLabs key in its environment
 * must still narrate with silence. Checking the credentials first — which is
 * the obvious way to write this — would quietly bill someone for running the
 * demo, which is precisely the surprise the mode system exists to prevent.
 */
export function realProvidersAllowed(mode: Mode = currentMode()): boolean {
  return mode !== 'demo';
}

function envPresent(names: string[]): boolean {
  return names.every((name) => {
    const value = process.env[name];
    return Boolean(value && value.trim().length > 0);
  });
}

/**
 * Real adapters register here. Until one is added for a configured provider,
 * having credentials set is reported as an explicit error rather than silently
 * behaving as if it worked.
 */
/**
 * Credentials are set for a provider nobody has written an adapter for.
 *
 * Only ever reached when real providers are permitted at all: in Demo Mode a
 * stray key in the environment must fall through to simulation rather than
 * throwing, or running the demo on a developer's machine breaks the moment
 * they configure anything.
 */
function unregistered(kind: string, providerName: string): never {
  throw new Error(
    `${kind} provider "${providerName}" has credentials but no adapter is registered. ` +
      `Implement it in lib/integrations/providers and register it in registry.ts.`,
  );
}

export function getVoiceProvider(): VoiceProvider {
  if (realProvidersAllowed() && elevenLabsConfigured()) return new ElevenLabsVoiceProvider();
  if (realProvidersAllowed() && envPresent(VOICE_ENV)) unregistered('Voice', config.voice.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedVoiceProvider();
  return new UnconnectedVoiceProvider(VOICE_ENV);
}

export function getImageProvider(): ImageProvider {
  if (realProvidersAllowed() && openAiImagesConfigured()) return new OpenAiImageProvider();
  if (realProvidersAllowed() && envPresent(IMAGE_ENV)) unregistered('Image', config.image.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedImageProvider();
  return new UnconnectedImageProvider(IMAGE_ENV);
}

export function getVideoProvider(): VideoProvider {
  if (realProvidersAllowed() && envPresent(VIDEO_ENV)) unregistered('Video', config.video.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedVideoProvider();
  return new UnconnectedVideoProvider(VIDEO_ENV);
}

export function getStockProvider(): StockMediaProvider {
  // Openverse needs no key — it is an open API — so it is configured by naming
  // it alone. That is why STOCK_ENV is checked after it rather than before.
  if (realProvidersAllowed() && openverseConfigured()) return new OpenverseStockProvider();
  if (realProvidersAllowed() && envPresent(STOCK_ENV)) unregistered('Stock media', process.env.STOCK_PROVIDER ?? 'unknown');
  if (simulationAllowed()) return new SimulatedStockProvider();
  return new UnconnectedStockProvider(STOCK_ENV);
}

let renderer: FfmpegRenderer | null = null;

/**
 * The renderer is local compute rather than an external service, so it is
 * genuinely connected whenever the binary is present — in Demo Mode and in
 * real mode alike.
 */
export function getVideoRenderer(): VideoRenderer {
  renderer ??= new FfmpegRenderer();
  return renderer;
}

/* ------------------------------------------------------------------ */
/* Studio providers                                                    */
/* ------------------------------------------------------------------ */

export function getMusicProvider(): MusicProvider {
  if (realProvidersAllowed() && envPresent(MUSIC_ENV)) unregistered('Music', process.env.MUSIC_PROVIDER ?? 'unknown');
  if (simulationAllowed()) return new SimulatedMusicProvider();
  return new UnconnectedMusicProvider(MUSIC_ENV);
}

export function getSubtitleProvider(): SubtitleProvider {
  if (realProvidersAllowed() && envPresent(SUBTITLE_ENV)) unregistered('Subtitle', process.env.SUBTITLE_PROVIDER ?? 'unknown');
  if (simulationAllowed()) return new SimulatedSubtitleProvider();
  return new UnconnectedSubtitleProvider(SUBTITLE_ENV);
}

export function getPublisher(): Publisher {
  if (realProvidersAllowed() && youtubeConfigured()) return new YouTubePublisher();
  if (simulationAllowed()) return new SimulatedPublisher();
  return new UnconnectedPublisher(PUBLISHER_ENV);
}

export function getAnalyticsProvider(): AnalyticsProvider {
  if (realProvidersAllowed() && youtubeConfigured()) return new YouTubeAnalyticsProvider();
  if (simulationAllowed()) return new SimulatedAnalyticsProvider();
  return new UnconnectedAnalyticsProvider(ANALYTICS_ENV);
}

/**
 * Every provider the studio can call, in one list.
 *
 * The order is the order of the pipeline, so the settings page reads as the
 * production line it describes rather than as an alphabetical inventory.
 */
export function describeMediaProviders(): ProviderDescriptor[] {
  return [
    getVoiceProvider().descriptor,
    getMusicProvider().descriptor,
    getImageProvider().descriptor,
    getVideoProvider().descriptor,
    getStockProvider().descriptor,
    getSubtitleProvider().descriptor,
    getVideoRenderer().descriptor,
    getPublisher().descriptor,
    getAnalyticsProvider().descriptor,
  ];
}
