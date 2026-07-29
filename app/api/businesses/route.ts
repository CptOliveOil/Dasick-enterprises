import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/ids';
import { withPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { newAgent, uniqueSlug } from '@/lib/agents/factory';
import { composeVisual } from '@/lib/agents/presets';
import { getTemplate } from '@/lib/agents/templates';
import { defaultSourcePolicy, defaultVisualRules } from '@/lib/islamic/policy';
import { defaultBudget, defaultProductionSettings } from '@/lib/production/defaults';
import { BUSINESS_KINDS } from '@/types/domain';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(BUSINESS_KINDS),
  description: z.string().trim().max(1000).default(''),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  currency: z.string().trim().length(3).toUpperCase().default('GBP'),
  /** YouTube channel profile, all optional. */
  channel: z
    .object({
      niche: z.string().trim().max(200).default(''),
      target_audience: z.string().trim().max(200).default(''),
      language: z.string().trim().max(60).default('English'),
      default_duration_minutes: z.number().min(1).max(120).default(8),
      content_style: z.string().trim().max(200).default(''),
    })
    .optional(),
  budget: z.number().min(0).max(1000).optional(),
  /** When true, Islamic specialists are offered/assigned to this channel. */
  islamic: z.boolean().default(false),
  /** Templates to create as this business' own agents. */
  agent_templates: z.array(z.string().max(64)).max(8).default([]),
});

/**
 * Creates a business, and optionally the agents that make it usable.
 *
 * The one judgement here: it will not create a duplicate specialist when a
 * suitable *shared* agent already exists. A second Manager or a second Finance
 * Agent would compete for the same work and split the same history for no
 * benefit — so only agents genuinely scoped to this business are created.
 */
export async function POST(request: Request) {
  return withPermission('settings.manage', async ({ store, ownerId }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Those business details are not valid.', detail: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const existing = await store.list('businesses', { where: { owner_id: ownerId } });
    const slug = uniqueSlug(input.name, existing.map((business) => business.slug));

    const timestamp = new Date().toISOString();
    const business = await store.insert('businesses', {
      id: uuid(),
      owner_id: ownerId,
      name: input.name,
      slug,
      kind: input.kind,
      description: input.description,
      colour: input.colour,
      currency: input.currency,
      is_demo: false,
      created_at: timestamp,
      updated_at: timestamp,
    });

    if (input.kind === 'youtube') {
      await store.insert('youtube_channels', {
        id: uuid(),
        business_id: business.id,
        name: input.name,
        handle: '',
        niche: input.channel?.niche ?? '',
        target_audience: input.channel?.target_audience ?? '',
        external_id: null,
        is_demo: false,
        created_at: timestamp,
      });

      const settings = defaultProductionSettings(ownerId, business.id);
      await store.insert('production_settings', {
        ...settings,
        language: input.channel?.language ?? settings.language,
      });

      const budget = defaultBudget(ownerId, business.id, input.currency);
      await store.insert('production_budgets', {
        ...budget,
        ...(input.budget !== undefined ? { max_cost_per_video: input.budget } : {}),
      });
    }

    if (input.islamic) {
      // Conservative defaults; nothing here assumes a school or a position.
      await store.insert('source_policies', defaultSourcePolicy(ownerId, business.id));
      await store.insert('visual_rules', defaultVisualRules(ownerId, business.id));
    }

    const agents = await store.list('agents', { where: { owner_id: ownerId } });
    const takenSlugs = agents.map((agent) => agent.slug);
    const created: string[] = [];
    const skipped: string[] = [];

    for (const key of input.agent_templates) {
      const template = getTemplate(key);
      if (!template || key === 'custom') continue;

      // A shared agent that already covers every capability this template
      // offers makes a second copy pointless — it would compete for the same
      // work and split the record of who did what.
      const coveredByShared = agents.some(
        (agent) =>
          agent.business_id === null &&
          !agent.archived_at &&
          template.capabilities.every((capability) => agent.capabilities.includes(capability)),
      );
      if (coveredByShared) {
        skipped.push(template.name);
        continue;
      }

      const name = `${template.name}`;
      const slugForAgent = uniqueSlug(name, takenSlugs);
      takenSlugs.push(slugForAgent);

      const agent = await store.insert(
        'agents',
        newAgent({
          owner_id: ownerId,
          business_id: business.id,
          name,
          slug: slugForAgent,
          role: template.role,
          description: template.description,
          system_prompt: template.system_prompt,
          capabilities: template.capabilities,
          agent_type: template.agent_type,
          memory_access: template.memory_access,
          authority_level: template.authority_level,
          template_key: template.key,
          visual: composeVisual(template.appearance, agents.length + created.length),
        }),
      );
      created.push(agent.name);
    }

    await logActivity(store, {
      ownerId,
      businessId: business.id,
      kind: 'system',
      message: `${business.name} was created${created.length > 0 ? ` with ${created.join(', ')}` : ''}`,
    });

    return NextResponse.json(
      { business, created_agents: created, reused_shared_agents: skipped },
      { status: 201 },
    );
  });
}
