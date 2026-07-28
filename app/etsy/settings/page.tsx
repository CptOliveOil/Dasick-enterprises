import { getWorkspace } from '@/lib/db/workspace';
import { getEtsyProvider } from '@/lib/integrations/platforms';
import { agentStatusStyle } from '@/lib/agents/status';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { ETSY_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function EtsySettingsPage() {
  const { store, ownerId, business } = await getWorkspace('etsy');
  if (!business) return <NoBusiness tabs={ETSY_TABS} title="Etsy" />;

  const [stores, agents] = await Promise.all([
    store.list('etsy_stores', { where: { business_id: business.id } }),
    store.list('agents', { where: { owner_id: ownerId, business_id: business.id } }),
  ]);
  const connected = getEtsyProvider().connected;

  return (
    <PageShell
      title="Etsy settings"
      description="Shops, connection state and the agents assigned to this business."
      tabs={ETSY_TABS}
    >
      <Section title="Connection">
        <Panel className="p-4">
          <p className="flex items-center justify-between text-[13px]">
            Etsy Open API
            <Badge tone={connected ? 'emerald' : 'neutral'}>
              {connected ? 'Connected' : 'Not connected'}
            </Badge>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            Required before any listing can be published. Publishing also always requires an
            explicit approval — connecting the API does not grant agents permission to publish.
          </p>
        </Panel>
      </Section>

      <Section title="Shops">
        <Panel className="overflow-hidden">
          {stores.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
              No shops configured.
            </p>
          ) : (
            <ul>
              {stores.map((shop) => (
                <li
                  key={shop.id}
                  className="border-b border-[var(--color-edge-soft)] px-4 py-3 last:border-0"
                >
                  <p className="text-[14px] font-medium">{shop.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">{shop.niche}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">{shop.url}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>

      <Section title="Agents on this business">
        <Panel className="overflow-hidden">
          <ul>
            {agents.map((agent) => {
              const style = agentStatusStyle(agent.status);
              return (
                <li
                  key={agent.id}
                  className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: agent.visual.colour }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]">{agent.name}</span>
                    <span className="block text-[11px] text-[var(--color-ink-faint)]">
                      {agent.capabilities.join(', ')}
                    </span>
                  </span>
                  <span className={`text-[12px] ${style.text}`}>{style.label}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </Section>
    </PageShell>
  );
}
