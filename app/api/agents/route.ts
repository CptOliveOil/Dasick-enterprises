import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { newAgent, uniqueSlug } from '@/lib/agents/factory';
import { unsupportedCapabilities } from '@/lib/agents/catalogue';
import { composeVisual } from '@/lib/agents/presets';
import { getTemplate } from '@/lib/agents/templates';
import { AGENT_TYPES, MEMORY_ACCESS_MODES } from '@/types/domain';

export const dynamic = 'force-dynamic';

const appearanceSchema = z.object({
  colour: z.string().min(1).max(32),
  size: z.string().min(1).max(32),
  ring: z.string().min(1).max(32),
  symbol: z.string().max(32).optional(),
});

const createSchema = z.object({
  template_key: z.string().max(64).nullable().optional(),
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().max(120).default(''),
  description: z.string().trim().max(2000).default(''),
  business_id: z.string().uuid().nullable().default(null),
  agent_type: z.enum(AGENT_TYPES).default('custom'),
  provider: z.enum(['anthropic', 'openai', 'google', 'mock']).default('anthropic'),
  model: z.string().trim().min(2).max(120).default('claude-sonnet-4-5'),
  temperature: z.number().min(0).max(1).default(0.7),
  max_tokens: z.number().int().min(256).max(64_000).default(4096),
  system_prompt: z.string().trim().min(20).max(20_000),
  capabilities: z.array(z.string().min(1).max(120)).min(1).max(20),
  authority_level: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  memory_access: z.enum(MEMORY_ACCESS_MODES).default('business'),
  appearance: appearanceSchema,
  enabled: z.boolean().default(true),
});

/**
 * Creates an agent.
 *
 * Three checks are done here rather than in the form, because the form is not a
 * security boundary and a capability that no handler implements would produce
 * an agent that fails every task it is ever given:
 *
 *   1. the permission, via `withPermission`;
 *   2. every capability resolves to a registered handler;
 *   3. the business, if named, actually belongs to this account.
 */
export async function POST(request: Request) {
  return withPermission('agents.create', async ({ store, ownerId }) => {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Those agent settings are not valid.', detail: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const unsupported = unsupportedCapabilities(input.capabilities);
    if (unsupported.length > 0) {
      return NextResponse.json(
        {
          error: `No handler implements ${unsupported.join(', ')}. An agent with a capability nothing can execute would fail every task it is given.`,
        },
        { status: 400 },
      );
    }

    if (input.business_id) {
      const business = await store.get('businesses', input.business_id);
      if (!business || business.owner_id !== ownerId) {
        return NextResponse.json({ error: 'That business does not exist.' }, { status: 400 });
      }
    }

    const existing = await store.list('agents', { where: { owner_id: ownerId } });
    const slug = uniqueSlug(input.name, existing.map((agent) => agent.slug));

    const agent = newAgent({
      owner_id: ownerId,
      business_id: input.business_id,
      name: input.name,
      slug,
      role: input.role || getTemplate(input.template_key ?? '')?.role || '',
      description: input.description,
      system_prompt: input.system_prompt,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      status: input.enabled ? 'idle' : 'disabled',
      authority_level: input.authority_level,
      capabilities: input.capabilities,
      agent_type: input.agent_type,
      memory_access: input.memory_access,
      template_key: input.template_key ?? null,
      is_custom: true,
      // The orbit slot comes from how many agents already exist, so a new
      // planet never lands on top of one that is already there.
      visual: composeVisual(input.appearance, existing.length),
    });

    await store.insert('agents', agent);

    await logActivity(store, {
      ownerId,
      businessId: agent.business_id,
      agentId: agent.id,
      kind: 'system',
      message: `${agent.name} joined the workforce — ${agent.capabilities.join(', ')}`,
    });

    return NextResponse.json(agent, { status: 201 });
  });
}
