import { getWorkspace } from '@/lib/db/workspace';
import { getYoutubeProvider } from '@/lib/integrations/platforms';
import { agentStatusStyle } from '@/lib/agents/status';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function YoutubeSettingsPage() {
  const { store, ownerId, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [channels, agents] = await Promise.all([
    store.list('youtube_channels', { where: { business_id: business.id } }),
    store.list('agents', { where: { owner_id: ownerId, business_id: business.id } }),
  ]);
  const connected = getYoutubeProvider().connected;

  return (
    <PageShell
      title="YouTube settings"
      description="Channels, connection state and the agents assigned to this business."
      tabs={YOUTUBE_TABS}
    >
      <Section title="Connection">
        <Panel className="p-4">
          <p className="flex items-center justify-between text-[13px]">
            YouTube Data API
            <Badge tone={connected ? 'emerald' : 'neutral'}>
              {connected ? 'Connected' : 'Not connected'}
            </Badge>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            Set <code className="font-mono text-[11px] text-amber-300">YOUTUBE_API_KEY</code> in
            the server environment and register an adapter in{' '}
            <code className="font-mono text-[11px]">lib/integrations/platforms.ts</code>. Keys are
            read on the server only and never reach the browser.
          </p>
        </Panel>
      </Section>

      <Section title="Channels">
        <Panel className="overflow-hidden">
          {channels.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
              No channels configured.
            </p>
          ) : (
            <ul>
              {channels.map((channel) => (
                <li
                  key={channel.id}
                  className="border-b border-[var(--color-edge-soft)] px-4 py-3 last:border-0"
                >
                  <p className="text-[14px] font-medium">
                    {channel.name}{' '}
                    <span className="text-[12px] font-normal text-[var(--color-ink-faint)]">
                      {channel.handle}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">{channel.niche}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                    {channel.target_audience}
                  </p>
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
