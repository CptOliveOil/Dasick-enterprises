import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { AGENT_TEMPLATES } from '@/lib/agents/templates';
import { NewBusinessForm } from '@/components/businesses/NewBusinessForm';
import { PageShell } from '@/components/layout/PageShell';
import { Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewBusinessPage() {
  const { store, ownerId, role } = await getSession();

  if (!can(role, 'settings.manage')) {
    return (
      <PageShell title="New business">
        <Panel className="p-6 text-[13px] text-[var(--color-ink-muted)]">
          Your role ({role}) cannot create businesses.
        </Panel>
      </PageShell>
    );
  }

  const agents = await store.list('agents', { where: { owner_id: ownerId } });
  // Templates whose work is already covered by a shared agent are shown as
  // "already covered" rather than offered again — creating a second one would
  // split the same work across two records for no benefit.
  const shared = agents.filter((agent) => agent.business_id === null && !agent.archived_at);

  const templates = AGENT_TEMPLATES.filter((template) => template.key !== 'custom').map(
    (template) => ({
      key: template.key,
      name: template.name,
      description: template.description,
      capabilities: template.capabilities,
      businessKind: template.business_kind,
      islamic: template.capabilities.some((capability) => capability.startsWith('islamic.')),
      coveredByShared: shared.some((agent) =>
        template.capabilities.every((capability) => agent.capabilities.includes(capability)),
      ),
    }),
  );

  return (
    <PageShell
      title="New business"
      description="A business is its own system: its own agents, missions, memory, analytics and budget."
      wide
    >
      <NewBusinessForm templates={templates} />
    </PageShell>
  );
}
