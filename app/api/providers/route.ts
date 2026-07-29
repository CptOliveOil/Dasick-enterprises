import { NextResponse } from 'next/server';
import { guardPermission } from '@/lib/auth/session';
import { z } from 'zod';
import { anthropicConfigured, isDemoMode } from '@/lib/config';
import {
  describeMediaProviders,
  getImageProvider,
  getStockProvider,
  getVideoProvider,
  getVideoRenderer,
  getVoiceProvider,
  simulationAllowed,
} from '@/lib/integrations/providers/registry';
import { getEtsyProvider, getYoutubeProvider } from '@/lib/integrations/platforms';
import { INTEGRATION_DEFINITIONS, resolveIntegrations } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

/**
 * The real configuration of every provider this server can reach.
 *
 * Connection state is derived from the environment on each request, never from
 * a stored flag, and no secret is ever returned.
 */
export async function GET() {
  const media = describeMediaProviders();
  const integrations = resolveIntegrations(INTEGRATION_DEFINITIONS);

  return NextResponse.json({
    demoMode: isDemoMode(),
    simulationAllowed: simulationAllowed(),
    ai: {
      anthropic: anthropicConfigured,
      integrations: integrations.filter((i) => i.kind === 'ai'),
    },
    media,
    platforms: [
      {
        kind: 'youtube',
        name: 'YouTube Data API',
        connected: getYoutubeProvider().connected,
        requiredEnv: ['YOUTUBE_API_KEY'],
      },
      {
        kind: 'etsy',
        name: 'Etsy Open API',
        connected: getEtsyProvider().connected,
        requiredEnv: ['ETSY_API_KEY'],
      },
    ],
  });
}

const testSchema = z.object({
  kind: z.enum(['voice', 'image', 'video', 'stock', 'renderer']),
});

/** Test connection. Runs the provider's own cheapest round trip. */
export async function POST(request: Request) {
  // Testing a connection makes a real (if cheap) call against a provider using
  // the server's credentials, so it needs the same permission as changing them.
  const guard = await guardPermission('integrations.manage');
  if ('response' in guard) return guard.response;
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown provider kind.' }, { status: 400 });
  }

  const provider = {
    voice: getVoiceProvider,
    image: getImageProvider,
    video: getVideoProvider,
    stock: getStockProvider,
    renderer: getVideoRenderer,
  }[parsed.data.kind]();

  try {
    const result = await provider.testConnection();
    return NextResponse.json({ ...result, descriptor: provider.descriptor });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      detail: error instanceof Error ? error.message : 'The test failed.',
      descriptor: provider.descriptor,
    });
  }
}
