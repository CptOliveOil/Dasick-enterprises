import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { capabilityGroups } from '@/lib/agents/catalogue';
import { AGENT_TEMPLATES } from '@/lib/agents/templates';
import { COLOUR_PRESETS, RING_PRESETS, SIZE_PRESETS, SYMBOL_PRESETS } from '@/lib/agents/presets';
import { AgentBuilder } from '@/components/agents/AgentBuilder';
import { PageShell } from '@/components/layout/PageShell';
import { Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The Agent Builder.
 *
 * The capability list is generated from the handler registry on the server, so
 * the form can only offer work the engine can actually do.
 */
export default async function NewAgentPage() {
  const { store, ownerId, role } = await getSession();

  if (!can(role, 'agents.create')) {
    return (
      <PageShell title="Create agent">
        <Panel className="p-6 text-[13px] text-[var(--color-ink-muted)]">
          Your role ({role}) cannot create agents.
        </Panel>
      </PageShell>
    );
  }

  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });

  return (
    <PageShell
      title="Create agent"
      description="A new planet in your galaxy. Choose what it can do, how much it may do unattended, and how it looks."
      wide
    >
      <AgentBuilder
        templates={AGENT_TEMPLATES}
        groups={capabilityGroups()}
        businesses={businesses.map((b) => ({ id: b.id, name: b.name, kind: b.kind }))}
        colours={COLOUR_PRESETS}
        sizes={SIZE_PRESETS}
        rings={RING_PRESETS}
        symbols={[...SYMBOL_PRESETS]}
      />
    </PageShell>
  );
}
