import 'server-only';
import { config, isDemoMode } from '@/lib/config';
import { FfmpegRenderer } from './ffmpeg-renderer';
import {
  SimulatedImageProvider,
  SimulatedStockProvider,
  SimulatedVideoProvider,
  SimulatedVoiceProvider,
} from './simulated';
import {
  UnconnectedImageProvider,
  UnconnectedStockProvider,
  UnconnectedVideoProvider,
  UnconnectedVoiceProvider,
} from './unconnected';
import type {
  ImageProvider,
  ProviderDescriptor,
  StockMediaProvider,
  VideoProvider,
  VideoRenderer,
  VoiceProvider,
} from './types';

export const VOICE_ENV = ['VOICE_PROVIDER', 'VOICE_PROVIDER_API_KEY'];
export const IMAGE_ENV = ['IMAGE_PROVIDER', 'IMAGE_PROVIDER_API_KEY'];
export const VIDEO_ENV = ['VIDEO_PROVIDER', 'VIDEO_PROVIDER_API_KEY'];
export const STOCK_ENV = ['STOCK_PROVIDER', 'STOCK_PROVIDER_API_KEY'];

/**
 * Whether Demo Mode may stand in for a missing media provider.
 *
 * Two conditions, both required: the application must be in Demo Mode (no
 * database configured), and the operator must not have opted out. Outside Demo
 * Mode a missing provider always blocks — it is never quietly simulated.
 */
export function simulationAllowed(): boolean {
  if (!isDemoMode()) return false;
  return process.env.DISABLE_SIMULATED_MEDIA !== 'true';
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
function unregistered(kind: string, providerName: string): never {
  throw new Error(
    `${kind} provider "${providerName}" has credentials but no adapter is registered. ` +
      `Implement it in lib/integrations/providers and register it in registry.ts.`,
  );
}

export function getVoiceProvider(): VoiceProvider {
  if (envPresent(VOICE_ENV)) unregistered('Voice', config.voice.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedVoiceProvider();
  return new UnconnectedVoiceProvider(VOICE_ENV);
}

export function getImageProvider(): ImageProvider {
  if (envPresent(IMAGE_ENV)) unregistered('Image', config.image.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedImageProvider();
  return new UnconnectedImageProvider(IMAGE_ENV);
}

export function getVideoProvider(): VideoProvider {
  if (envPresent(VIDEO_ENV)) unregistered('Video', config.video.provider ?? 'unknown');
  if (simulationAllowed()) return new SimulatedVideoProvider();
  return new UnconnectedVideoProvider(VIDEO_ENV);
}

export function getStockProvider(): StockMediaProvider {
  if (envPresent(STOCK_ENV)) unregistered('Stock media', process.env.STOCK_PROVIDER ?? 'unknown');
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

export function describeMediaProviders(): ProviderDescriptor[] {
  return [
    getVoiceProvider().descriptor,
    getImageProvider().descriptor,
    getVideoProvider().descriptor,
    getStockProvider().descriptor,
    getVideoRenderer().descriptor,
  ];
}
