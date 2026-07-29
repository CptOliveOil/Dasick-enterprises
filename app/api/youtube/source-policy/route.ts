import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { getSourcePolicy, getVisualRules } from '@/lib/islamic/resolve';
import { WEAK_HADITH_POLICIES } from '@/types/islamic';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  business_id: z.string().uuid(),
  policy: z
    .object({
      methodology_notes: z.string().max(4000),
      preferred_translation: z.string().max(200),
      source_policy_notes: z.string().max(4000),
      arabic_display: z.enum(['none', 'arabic_only', 'arabic_with_translation', 'translation_only']),
      religious_disclaimer: z.string().max(1000),
      require_quran_reference: z.boolean(),
      require_hadith_grading: z.boolean(),
      require_source_check_before_script_approval: z.boolean(),
      weak_hadith_policy: z.enum(WEAK_HADITH_POLICIES),
      require_difference_labelling: z.boolean(),
    })
    .partial()
    .optional(),
  visual: z
    .object({
      no_prophet_depiction: z.boolean(),
      no_divine_depiction: z.boolean(),
      no_generated_sacred_text: z.boolean(),
      require_calligraphy_approval: z.boolean(),
      human_depiction: z.enum(['none', 'faceless', 'allowed']),
      background_music: z.enum(['none', 'ambient_only', 'allowed']),
      extra_notes: z.string().max(4000),
    })
    .partial()
    .optional(),
});

/**
 * Saves a channel's source policy and visual rules.
 *
 * Editorial choices, not application beliefs — nothing here is defaulted to a
 * madhhab or a theological position, and the API does not second-guess what the
 * operator selects.
 */
export async function PATCH(request: Request) {
  return withPermission('settings.manage', async ({ store, ownerId }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Those settings are not valid.' }, { status: 400 });
    }
    const { business_id: businessId, policy, visual } = parsed.data;

    const business = await store.get('businesses', businessId);
    if (!business || business.owner_id !== ownerId) {
      return NextResponse.json({ error: 'That business does not exist.' }, { status: 404 });
    }

    const timestamp = new Date().toISOString();
    const current = await getSourcePolicy(store, ownerId, businessId);
    const currentVisual = await getVisualRules(store, ownerId, businessId);

    const savedPolicy = policy
      ? await store.update('source_policies', current.id, { ...policy, updated_at: timestamp })
      : current;
    const savedVisual = visual
      ? await store.update('visual_rules', currentVisual.id, { ...visual, updated_at: timestamp })
      : currentVisual;

    return NextResponse.json({ policy: savedPolicy, visual: savedVisual });
  });
}
