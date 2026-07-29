import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can, permissionsFor, PERMISSIONS, ROLE_DESCRIPTIONS } from '@/lib/auth/permissions';
import { newAgent, uniqueSlug } from '@/lib/agents/factory';
import { appearanceOf, composeVisual, COLOUR_PRESETS } from '@/lib/agents/presets';
import { AGENT_TEMPLATES, getTemplate } from '@/lib/agents/templates';
import { capabilityGroups, supportedCapabilities, unsupportedCapabilities } from '@/lib/agents/catalogue';
import { listCapabilities } from '@/lib/agents/capabilities';
import { resolveAgentForCapability } from '@/lib/workflows/engine';
import { loadRelevantMemory } from '@/lib/agents/context';
import { ACCOUNT_ROLES } from '@/types/domain';
import { makeAgent, makeBusiness, makeWorkspace, OWNER_ID } from './helpers';
import { MemoryStore } from '@/lib/db/memory-store';
import { newMemory } from '@/lib/agents/memory-factory';
import { uuid } from '@/lib/ids';

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});

/* ------------------------------------------------------------------ */
/* Roles and permissions                                               */
/* ------------------------------------------------------------------ */

describe('owner permissions', () => {
  it('gives the owner every permission the application defines', () => {
    for (const permission of PERMISSIONS) {
      expect(can('owner', permission)).toBe(true);
    }
  });

  it('describes every role, so none can be added without being explained', () => {
    for (const role of ACCOUNT_ROLES) {
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
      expect(permissionsFor(role).length).toBeGreaterThan(0);
    }
  });

  it('keeps publishing and account management with the owner alone', () => {
    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(can(role, 'content.publish')).toBe(false);
      expect(can(role, 'account.manage')).toBe(false);
    }
  });

  it('never lets a viewer change anything', () => {
    const forbidden = [
      'agents.create',
      'agents.edit',
      'agents.disable',
      'missions.create',
      'tasks.approve',
      'integrations.manage',
      'budgets.manage',
      'content.publish',
      'settings.manage',
    ] as const;
    for (const permission of forbidden) {
      expect(can('viewer', permission)).toBe(false);
    }
    // But it can still read, which is the point of the role.
    expect(can('viewer', 'businesses.view')).toBe(true);
    expect(can('viewer', 'finance.view')).toBe(true);
  });

  it('gives a member the ability to start work but not to approve it', () => {
    expect(can('member', 'missions.create')).toBe(true);
    expect(can('member', 'tasks.approve')).toBe(false);
    expect(can('member', 'budgets.manage')).toBe(false);
  });

  it('escalates cleanly: each role is a superset of the one below', () => {
    const order = ['viewer', 'member', 'admin', 'owner'] as const;
    for (let i = 1; i < order.length; i += 1) {
      const lower = permissionsFor(order[i - 1]!);
      const higher = permissionsFor(order[i]!);
      for (const permission of lower) {
        expect(higher).toContain(permission);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Agent creation                                                      */
/* ------------------------------------------------------------------ */

describe('agent creation', () => {
  it('fills every field an Agent needs, so no column is silently undefined', () => {
    const agent = newAgent({
      owner_id: OWNER_ID,
      name: 'Custom',
      slug: 'custom',
      visual: composeVisual({ colour: 'jade', size: 'medium', ring: 'none' }, 0),
    });

    expect(agent.agent_type).toBe('custom');
    expect(agent.memory_access).toBe('business');
    expect(agent.is_custom).toBe(true);
    expect(agent.archived_at).toBeNull();
    expect(agent.template_key).toBeNull();
    expect(agent.tasks_completed).toBe(0);
    expect(agent.status).toBe('idle');
  });

  it('never issues a slug that collides within an account', () => {
    const taken = ['islamic-researcher', 'islamic-researcher-2'];
    expect(uniqueSlug('Islamic Researcher', taken)).toBe('islamic-researcher-3');
    expect(uniqueSlug('Islamic Researcher!', [])).toBe('islamic-researcher');
    // A name with nothing sluggable still produces something addressable.
    expect(uniqueSlug('!!!', [])).toBe('agent');
  });

  it('spreads new planets so two agents never share an orbit slot', () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < 12; slot += 1) {
      const visual = composeVisual({ colour: 'azure', size: 'medium', ring: 'none' }, slot);
      seen.add(`${visual.orbit}:${visual.angle}`);
      expect(visual.radius).toBeGreaterThan(0);
      expect(visual.speed).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(12);
  });

  it('round-trips an appearance through compose and back', () => {
    for (const preset of COLOUR_PRESETS) {
      const visual = composeVisual({ colour: preset.key, size: 'large', ring: 'ringed' }, 3);
      const back = appearanceOf(visual);
      expect(back.colour).toBe(preset.key);
      expect(back.size).toBe('large');
      expect(back.ring).toBe('ringed');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

describe('agent templates', () => {
  it('only ever offers capabilities the engine can actually execute', () => {
    const supported = supportedCapabilities();
    for (const template of AGENT_TEMPLATES) {
      for (const capability of template.capabilities) {
        expect(
          supported.has(capability),
          `${template.key} offers "${capability}", which no handler implements`,
        ).toBe(true);
      }
    }
  });

  it('gives every template usable instructions and a coherent appearance', () => {
    for (const template of AGENT_TEMPLATES) {
      expect(template.system_prompt.trim().length).toBeGreaterThan(50);
      expect(
        COLOUR_PRESETS.some((preset) => preset.key === template.appearance.colour),
        `${template.key} uses a colour outside the curated set`,
      ).toBe(true);
    }
  });

  it('ships the two Islamic templates the workflow depends on', () => {
    const researcher = getTemplate('islamic_researcher')!;
    const checker = getTemplate('islamic_source_checker')!;

    expect(researcher.capabilities).toEqual(['islamic.research', 'islamic.content_plan']);
    expect(checker.capabilities).toEqual(['islamic.source_verify', 'islamic.script_review']);
    // The instruction that matters most has to actually be in the prompt.
    expect(researcher.system_prompt).toMatch(/do not invent/i);
    expect(checker.system_prompt).toMatch(/cannot be confirmed|needs a source/i);
  });

  it('keeps every template at or below drafting authority', () => {
    // A template that arrived pre-authorised to spend or publish would be a
    // trap: the operator would not have chosen it deliberately.
    for (const template of AGENT_TEMPLATES) {
      expect(template.authority_level).toBeLessThanOrEqual(2);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Capability catalogue                                                */
/* ------------------------------------------------------------------ */

describe('capability catalogue', () => {
  it('exposes every registered handler exactly once', () => {
    const groups = capabilityGroups();
    const listed = groups.flatMap((group) => group.capabilities.map((c) => c.capability));
    const registered = listCapabilities().map((c) => c.capability);

    expect(listed.slice().sort()).toEqual(registered.slice().sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('rejects capabilities that nothing implements', () => {
    expect(unsupportedCapabilities(['islamic.research'])).toEqual([]);
    expect(unsupportedCapabilities(['totally.made.up'])).toEqual(['totally.made.up']);
    expect(
      unsupportedCapabilities(['islamic.research', 'does.not.exist', 'youtube.script.write']),
    ).toEqual(['does.not.exist']);
  });

  it('groups the Islamic capabilities together', () => {
    const islamic = capabilityGroups().find((group) => group.key === 'islamic');
    expect(islamic).toBeTruthy();
    expect(islamic!.capabilities.map((c) => c.capability).sort()).toEqual([
      'islamic.content_plan',
      'islamic.research',
      'islamic.script_review',
      'islamic.source_verify',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Ownership, archiving and scoping                                    */
/* ------------------------------------------------------------------ */

describe('agent resolution', () => {
  it('never assigns work to an archived agent', async () => {
    const { store, business } = await makeWorkspace();

    const before = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      business.id,
    );
    expect(before).toBeTruthy();

    await store.update('agents', before!, {
      archived_at: new Date().toISOString(),
      status: 'disabled',
    });

    const after = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      business.id,
    );
    expect(after).toBeNull();
  });

  it('prefers an agent scoped to the business over a global one', async () => {
    const { store, business } = await makeWorkspace();
    const other = makeBusiness({ name: 'Other', slug: 'other' });
    await store.insert('businesses', other);

    const global = makeAgent({
      name: 'Global Writer',
      slug: 'global-writer',
      business_id: null,
      capabilities: ['youtube.script.write'],
    });
    await store.insert('agents', global);

    const scoped = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      business.id,
    );
    const scopedAgent = await store.get('agents', scoped!);
    expect(scopedAgent!.business_id).toBe(business.id);

    // A business with no scoped writer falls back to the global one rather
    // than borrowing another channel's.
    const fallback = await resolveAgentForCapability(
      store,
      OWNER_ID,
      'youtube.script.write',
      other.id,
    );
    expect(fallback).toBe(global.id);
  });
});

/* ------------------------------------------------------------------ */
/* Memory isolation                                                    */
/* ------------------------------------------------------------------ */

describe('per-channel memory isolation', () => {
  async function seedMemory() {
    const store = new MemoryStore();
    const channelA = makeBusiness({ name: 'History', slug: 'history' });
    const channelB = makeBusiness({ name: 'Islamic Channel', slug: 'islamic-channel' });
    await store.insertMany('businesses', [channelA, channelB]);

    const agent = makeAgent({
      name: 'Shared Researcher',
      slug: 'shared-researcher',
      business_id: channelA.id,
      capabilities: ['youtube.research.package'],
    });
    await store.insert('agents', agent);

    const rows = [
      ['A only', channelA.id],
      ['B only', channelB.id],
      ['applies everywhere', null],
    ] as const;

    await store.insertMany(
      'agent_memory',
      rows.map(([content, businessId]) =>
        newMemory({
          agent_id: agent.id,
          business_id: businessId,
          type: 'insight',
          content,
          importance: 5,
          source: 'test',
        }),
      ),
    );

    return { store, agent, channelA, channelB };
  }

  it('keeps one channel’s learned preferences out of another’s prompt', async () => {
    const { store, agent, channelA, channelB } = await seedMemory();

    const forA = await loadRelevantMemory(store, agent, channelA.id);
    expect(forA.map((m) => m.content).sort()).toEqual(['A only', 'applies everywhere']);

    const forB = await loadRelevantMemory(store, agent, channelB.id);
    expect(forB.map((m) => m.content).sort()).toEqual(['B only', 'applies everywhere']);
  });

  it('loads nothing at all when memory access is off', async () => {
    const { store, agent, channelA } = await seedMemory();
    const stateless = { ...agent, memory_access: 'none' as const };
    expect(await loadRelevantMemory(store, stateless, channelA.id)).toEqual([]);
  });

  it('crosses businesses only when explicitly set to agent-wide', async () => {
    const { store, agent, channelA } = await seedMemory();
    const wide = { ...agent, memory_access: 'agent' as const };
    const loaded = await loadRelevantMemory(store, wide, channelA.id);
    expect(loaded).toHaveLength(3);
  });
});
