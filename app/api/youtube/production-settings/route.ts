import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { getWorkspace } from '@/lib/db/workspace';
import { resolveSettings } from '@/lib/production/resolve';
import { getBudget } from '@/lib/finance/budgets';
import { getVoiceProvider } from '@/lib/integrations/providers/registry';
import { recordOperatorAction } from '@/lib/production/actions';

export const dynamic = 'force-dynamic';

/** Voice, render, caption, music and budget settings for the YouTube business. */
export async function GET() {
  const { store, ownerId, business } = await getWorkspace('youtube');
  if (!business) {
    return NextResponse.json({ error: 'No YouTube business exists.' }, { status: 404 });
  }

  const [settings, budget] = await Promise.all([
    resolveSettings(store, ownerId, business.id),
    getBudget(store, ownerId, business.id, business.currency),
  ]);

  const voice = getVoiceProvider();
  // Voices are only listed when a provider is genuinely connected. An empty
  // list is the honest answer, not a menu of options that cannot be used.
  const voices = voice.isConnected() ? await voice.listVoices().catch(() => []) : [];

  return NextResponse.json({
    settings,
    budget,
    voiceProvider: voice.descriptor,
    voices,
  });
}

const patchSchema = z.object({
  settings: z
    .object({
      voice_provider: z.string().max(60).optional(),
      voice_id: z.string().max(120).optional(),
      voice_name: z.string().max(120).optional(),
      voice_speed: z.number().min(0.5).max(1.5).optional(),
      language: z.string().min(2).max(12).optional(),
      narration_style: z.string().max(300).optional(),
      width: z.number().int().min(640).max(3840).optional(),
      height: z.number().int().min(360).max(2160).optional(),
      fps: z.number().int().min(24).max(60).optional(),
      captions_enabled: z.boolean().optional(),
      burn_in_captions: z.boolean().optional(),
      music_mode: z.enum(['none', 'uploaded', 'provider']).optional(),
      music_volume: z.number().min(0).max(1).optional(),
      music_fade_in: z.number().min(0).max(15).optional(),
      music_fade_out: z.number().min(0).max(15).optional(),
      auto_publish_after_approval: z.boolean().optional(),
    })
    .optional(),
  budget: z
    .object({
      max_cost_per_video: z.number().min(0).max(1000).optional(),
      max_image_spend: z.number().min(0).max(1000).optional(),
      max_video_spend: z.number().min(0).max(1000).optional(),
      max_voice_spend: z.number().min(0).max(1000).optional(),
      approval_threshold: z.number().min(0).max(1000).optional(),
      concurrency: z.number().int().min(1).max(8).optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const { business } = await getWorkspace('youtube');
  if (!business) {
    return NextResponse.json({ error: 'No YouTube business exists.' }, { status: 404 });
  }

  const timestamp = new Date().toISOString();
  const current = await resolveSettings(store, ownerId, business.id);
  const budget = await getBudget(store, ownerId, business.id, business.currency);

  const settings = parsed.data.settings
    ? await store.update('production_settings', current.id, {
        ...parsed.data.settings,
        updated_at: timestamp,
      })
    : current;

  const updatedBudget = parsed.data.budget
    ? await store.update('production_budgets', budget.id, {
        ...parsed.data.budget,
        updated_at: timestamp,
      })
    : budget;

  // Turning on auto-publish is consequential enough to be recorded explicitly.
  if (parsed.data.settings?.auto_publish_after_approval !== undefined) {
    await recordOperatorAction(store, {
      ownerId,
      businessId: business.id,
      message: `Auto-publish after final approval was turned ${
        parsed.data.settings.auto_publish_after_approval ? 'on' : 'off'
      }`,
    });
  }

  return NextResponse.json({ settings, budget: updatedBudget });
}
