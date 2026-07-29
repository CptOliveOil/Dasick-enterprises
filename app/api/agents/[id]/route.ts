import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/auth/session';
import { logActivity } from '@/lib/agents/activity';
import { unsupportedCapabilities } from '@/lib/agents/catalogue';
import { newAgent, uniqueSlug } from '@/lib/agents/factory';
import { appearanceOf, composeVisual } from '@/lib/agents/presets';
import { AGENT_TYPES, MEMORY_ACCESS_MODES } from '@/types/domain';

export const dynamic = 'force-dynamic';

const appearanceSchema = z.object({
  colour: z.string().min(1).max(32),
  size: z.string().min(1).max(32),
  ring: z.string().min(1).max(32),
  symbol: z.string().max(32).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  business_id: z.string().uuid().nullable().optional(),
  agent_type: z.enum(AGENT_TYPES).optional(),
  status: z.enum(['idle', 'disabled', 'offline']).optional(),
  system_prompt: z.string().min(10).max(20_000).optional(),
  model: z.string().min(2).max(120).optional(),
  provider: z.enum(['anthropic', 'openai', 'google', 'mock']).optional(),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(256).max(64_000).optional(),
  capabilities: z.array(z.string().min(1).max(120)).min(1).max(20).optional(),
  memory_access: z.enum(MEMORY_ACCESS_MODES).optional(),
  appearance: appearanceSchema.optional(),
  /** Archive rather than delete. History is never destroyed. */
  archived: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withPermission('agents.edit', async ({ store, ownerId }) => {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Those agent settings are not valid.', detail: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const agent = await store.get('agents', id);
    if (!agent || agent.owner_id !== ownerId) {
      return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
    }

    const { appearance, archived, ...fields } = parsed.data;

    if (fields.capabilities) {
      const unsupported = unsupportedCapabilities(fields.capabilities);
      if (unsupported.length > 0) {
        return NextResponse.json(
          { error: `No handler implements ${unsupported.join(', ')}.` },
          { status: 400 },
        );
      }
    }

    if (fields.business_id) {
      const business = await store.get('businesses', fields.business_id);
      if (!business || business.owner_id !== ownerId) {
        return NextResponse.json({ error: 'That business does not exist.' }, { status: 400 });
      }
    }

    const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };

    if (appearance) {
      // Keep the orbit the planet already has. Re-deriving it would make a
      // colour change teleport the planet across the galaxy.
      patch.visual = {
        ...composeVisual(appearance, 0),
        orbit: agent.visual.orbit,
        angle: agent.visual.angle,
        speed: agent.visual.speed,
        inclination: agent.visual.inclination,
      };
    }

    if (archived !== undefined) {
      patch.archived_at = archived ? new Date().toISOString() : null;
      // An archived agent must not be picked up by capability resolution.
      if (archived) patch.status = 'disabled';
      else if (agent.status === 'disabled') patch.status = 'idle';
    }

    const updated = await store.update('agents', id, patch);

    if (parsed.data.status && parsed.data.status !== agent.status) {
      await logActivity(store, {
        ownerId,
        businessId: agent.business_id,
        agentId: agent.id,
        kind: 'system',
        message: `${agent.name} was set to ${parsed.data.status}`,
      });
    }
    if (archived !== undefined) {
      await logActivity(store, {
        ownerId,
        businessId: agent.business_id,
        agentId: agent.id,
        kind: 'system',
        message: archived
          ? `${agent.name} was archived — its task history is kept`
          : `${agent.name} was restored`,
      });
    }

    return NextResponse.json(updated);
  });
}

/**
 * There is no DELETE.
 *
 * Tasks, activity logs, costs and approvals all reference an agent. Removing
 * the row would leave a mission whose history says "someone did this" — so the
 * destructive option is simply not offered. Archive is the answer, and it is
 * reversible.
 */
export async function DELETE() {
  return NextResponse.json(
    {
      error:
        'Agents are archived, not deleted, so their task history, costs and activity stay intact. PATCH { "archived": true } instead.',
    },
    { status: 405 },
  );
}

/** Copies an agent, including its instructions, as a new draft. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withPermission('agents.create', async ({ store, ownerId }) => {
    const body = (await request.json().catch(() => ({}))) as { action?: string; name?: string };
    if (body.action !== 'duplicate') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const source = await store.get('agents', id);
    if (!source || source.owner_id !== ownerId) {
      return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });
    }

    const existing = await store.list('agents', { where: { owner_id: ownerId } });
    const name = (body.name?.trim() || `${source.name} copy`).slice(0, 80);

    // Everything that describes *how the agent works* is copied. Everything
    // that describes *what this agent has done* is not — statistics, cost and
    // history belong to the agent that earned them.
    const created = await store.insert(
      'agents',
      newAgent({
        owner_id: ownerId,
        business_id: source.business_id,
        name,
        slug: uniqueSlug(name, existing.map((agent) => agent.slug)),
        role: source.role,
        description: source.description,
        system_prompt: source.system_prompt,
        provider: source.provider,
        model: source.model,
        temperature: source.temperature,
        max_tokens: source.max_tokens,
        authority_level: source.authority_level,
        capabilities: [...source.capabilities],
        agent_type: source.agent_type,
        memory_access: source.memory_access,
        template_key: source.template_key,
        // A copy arrives disabled, so a duplicate never silently starts picking
        // up work the operator has not looked at yet.
        status: 'disabled',
        is_custom: true,
        visual: composeVisual(appearanceOf(source.visual), existing.length),
      }),
    );

    await logActivity(store, {
      ownerId,
      businessId: created.business_id,
      agentId: created.id,
      kind: 'system',
      message: `${created.name} was created as a copy of ${source.name}, disabled until you enable it`,
    });

    return NextResponse.json(created, { status: 201 });
  });
}
