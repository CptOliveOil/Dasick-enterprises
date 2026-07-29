import { uuid } from '@/lib/ids';
import type { Agent } from '@/types/domain';

/**
 * One place that knows the shape of an agent row.
 *
 * The seed and the Agent Builder both go through this, so a field added to
 * `Agent` cannot end up present on seeded agents and `undefined` on
 * operator-created ones.
 */
export function newAgent(
  input: Partial<Agent> & { owner_id: string; name: string; slug: string; visual: Agent['visual'] },
): Agent {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    business_id: null,
    role: '',
    description: '',
    system_prompt: '',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    temperature: 0.7,
    max_tokens: 4096,
    status: 'idle',
    authority_level: 1,
    current_task_id: null,
    capabilities: [],
    agent_type: 'custom',
    memory_access: 'business',
    template_key: null,
    is_custom: true,
    archived_at: null,
    is_demo: false,
    tasks_completed: 0,
    tasks_failed: 0,
    average_execution_time: 0,
    estimated_total_cost: 0,
    last_run_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...input,
  };
}

/**
 * Turns a name into a slug that is unique within the account.
 *
 * Slugs are how agents are addressed in URLs and in the Commander's plans, so a
 * collision is not cosmetic — it would route work to the wrong planet.
 */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent';

  const existing = new Set(taken);
  if (!existing.has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
