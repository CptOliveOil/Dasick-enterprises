import Link from 'next/link';
import { getStore } from '@/lib/db';
import { config, demoMode, supabaseConfigured } from '@/lib/config';
import { INTEGRATION_DEFINITIONS, resolveIntegrations } from '@/lib/integrations/registry';
import { describeMediaProviders, simulationAllowed } from '@/lib/integrations/providers/registry';
import { ProviderPanel } from '@/components/settings/ProviderPanel';
import { SETTINGS_TABS } from '@/components/settings/tabs';
import { AUTHORITY_DESCRIPTIONS } from '@/lib/agents/authority';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import type { IntegrationKind } from '@/types/domain';

export const dynamic = 'force-dynamic';

const SECTION_TITLES: Record<IntegrationKind, string> = {
  ai: 'AI providers',
  youtube: 'YouTube',
  etsy: 'Etsy',
  voice: 'Voice generation',
  image: 'Image generation',
  video: 'Video generation',
};

/**
 * Settings reports the real configuration of the running server. Connection
 * state is derived from the environment, never from a stored flag.
 */
export default async function SettingsPage() {
  const { store, ownerId } = await getStore();
  const [businesses, agents] = await Promise.all([
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('agents', { where: { owner_id: ownerId } }),
  ]);

  const integrations = resolveIntegrations(INTEGRATION_DEFINITIONS);
  const mediaProviders = describeMediaProviders();
  const grouped = integrations.reduce<Record<string, typeof integrations>>((acc, item) => {
    (acc[item.kind] ??= []).push(item);
    return acc;
  }, {});

  return (
    <PageShell
      title="Settings"
      description="How this instance of Command Centre is actually configured."
      tabs={SETTINGS_TABS}
      wide
    >
      <Section title="Profile">
        <Panel className="p-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Row label="Display currency" value={config.currency} />
            <Row label="Storage" value={supabaseConfigured ? 'Supabase (Postgres)' : 'In-memory'} />
            <Row
              label="Authentication"
              value={supabaseConfigured ? 'Supabase Auth' : 'Not required in demo mode'}
            />
          </dl>
          {demoMode && (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-amber-100/80">
              <strong className="font-semibold">Demo mode.</strong> No Supabase credentials are
              set, so this session runs on a seeded in-memory dataset. Everything works —
              missions, agents, approvals, finance — but the data resets when the server
              restarts and every seeded row is labelled Demo. Set{' '}
              <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
              switch to a real database.
            </p>
          )}
        </Panel>
      </Section>

      <Section title="Businesses">
        <Panel className="overflow-hidden">
          <ul>
            {businesses.map((business) => (
              <li
                key={business.id}
                className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-3 last:border-0"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: business.colour }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">{business.name}</span>
                  <span className="block text-[11px] text-[var(--color-ink-faint)]">
                    {business.kind} · {business.currency}
                  </span>
                </span>
                <Link
                  href={`/${business.slug}`}
                  className="shrink-0 text-[12px] text-amber-400 underline-offset-4 hover:underline"
                >
                  Open →
                </Link>
              </li>
            ))}
            {businesses.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                No businesses configured.
              </li>
            )}
          </ul>
        </Panel>
      </Section>

      <Section title="Media providers">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {mediaProviders.map((descriptor) => (
            <ProviderPanel key={descriptor.kind} descriptor={descriptor} />
          ))}
        </div>
        {simulationAllowed() && (
          <p className="mt-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-amber-100/80">
            <strong className="font-semibold">Demo Mode simulation is on.</strong> Missing voice,
            image, video and stock providers are standing in with clearly-marked placeholder media
            so the whole production pipeline can be demonstrated. Every asset it produces is
            flagged Simulated and never given a public URL. Set{' '}
            <code className="font-mono text-[11px]">DISABLE_SIMULATED_MEDIA=true</code> to make
            those steps block instead.
          </p>
        )}
      </Section>

      {(Object.keys(grouped) as IntegrationKind[]).map((kind) => (
        <Section key={kind} title={SECTION_TITLES[kind]}>
          <div className="grid gap-3 md:grid-cols-2">
            {grouped[kind]!.map((integration) => (
              <Panel key={integration.id} className="p-4">
                <p className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{integration.provider}</span>
                    <span className="block text-[11px] text-[var(--color-ink-faint)]">
                      {integration.label}
                    </span>
                  </span>
                  <Badge tone={integration.connected ? 'emerald' : 'neutral'}>
                    {integration.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                  {integration.notes}
                </p>
                {!integration.connected && (
                  <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                    Set{' '}
                    {integration.required_env.map((name, i) => (
                      <span key={name}>
                        {i > 0 && ' and '}
                        <code className="font-mono text-amber-300">{name}</code>
                      </span>
                    ))}{' '}
                    in the server environment. Keys are never sent to the browser.
                  </p>
                )}
              </Panel>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Agent models">
        <Panel className="overflow-hidden">
          <ul>
            {agents.map((agent) => (
              <li
                key={agent.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-edge-soft)] px-4 py-2.5 text-[13px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                <span className="text-[11px] text-[var(--color-ink-faint)]">
                  {agent.provider} · {agent.model} · temp {agent.temperature} ·{' '}
                  {agent.max_tokens.toLocaleString('en-GB')} tokens
                </span>
                <Link
                  href={`/agents/${agent.slug}`}
                  className="shrink-0 text-[12px] text-amber-400 underline-offset-4 hover:underline"
                >
                  Edit →
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      <Section title="Security and authority">
        <Panel className="p-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            Agents operate under an authority level. Regardless of level, spending money,
            purchasing, publishing publicly, sending external messages, deleting important data
            and changing account settings always stop and request your approval unless the task
            carries an explicit authorisation for that exact action.
          </p>
          <dl className="mt-3 space-y-2">
            {(Object.keys(AUTHORITY_DESCRIPTIONS) as unknown as string[]).map((key) => {
              const info = AUTHORITY_DESCRIPTIONS[Number(key) as 0 | 1 | 2 | 3 | 4];
              return (
                <div key={key} className="flex gap-3">
                  <dt className="w-[68px] shrink-0 font-mono text-[11px] text-amber-400">
                    Level {key}
                  </dt>
                  <dd className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                    <span className="text-[var(--color-ink)]">{info.name}</span> — {info.detail}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      </Section>

      <Section title="Appearance">
        <Panel className="p-4">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Command Centre is dark-first by design — the interface is a starfield. It respects{' '}
            <code className="font-mono text-[11px]">prefers-reduced-motion</code>: with reduced
            motion enabled, orbital movement and pulses stop and state is conveyed by colour and
            text alone.
          </p>
        </Panel>
      </Section>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px]">{value}</dd>
    </div>
  );
}
