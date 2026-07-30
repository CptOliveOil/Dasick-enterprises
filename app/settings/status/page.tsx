import { getSession } from '@/lib/auth/session';
import { anthropicConfigured, config, supabaseConfigured } from '@/lib/config';
import { describeMediaProviders, simulationAllowed } from '@/lib/integrations/providers/registry';
import { INTEGRATION_DEFINITIONS, resolveIntegrations } from '@/lib/integrations/registry';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { SETTINGS_TABS } from '@/components/settings/tabs';

export const dynamic = 'force-dynamic';

/**
 * Three words, and only three.
 *
 * CONNECTED means it reaches the real service. SIMULATED means Command Centre
 * is standing in for it and everything it produces is labelled. NOT CONNECTED
 * means work that needs it stops and says so. An operator should never have to
 * work out which of the three they are looking at.
 */
type State = 'connected' | 'simulated' | 'missing';

const LABEL: Record<State, string> = {
  connected: 'CONNECTED',
  simulated: 'SIMULATED',
  missing: 'NOT CONNECTED',
};

const TONE: Record<State, 'emerald' | 'amber' | 'red' | 'neutral'> = {
  connected: 'emerald',
  simulated: 'amber',
  missing: 'red',
};

/**
 * What this instance actually is, right now.
 *
 * Command Centre behaves genuinely differently without Supabase — no accounts,
 * in-memory storage, simulated media — and that difference is invisible from
 * the interface itself. This page states it plainly, in one place, so "why is
 * my data gone" and "why is this public" are answerable in ten seconds.
 */
export default async function SystemStatusPage() {
  const { isDemo } = await getSession();
  const providers = describeMediaProviders();
  const integrations = resolveIntegrations(INTEGRATION_DEFINITIONS);

  const youtube = integrations.find((item) => item.kind === 'youtube');
  const renderer = providers.find((item) => item.kind === 'renderer');
  const voice = providers.find((item) => item.kind === 'voice');
  const image = providers.find((item) => item.kind === 'image');
  const video = providers.find((item) => item.kind === 'video');
  const stock = providers.find((item) => item.kind === 'stock');

  const providerState = (descriptor: (typeof providers)[number] | undefined): State =>
    !descriptor ? 'missing' : descriptor.simulated ? 'simulated' : descriptor.connected ? 'connected' : 'missing';

  const etsy = integrations.find((item) => item.kind === 'etsy');

  const rows: { label: string; state: State; value: string; detail: string }[] = [
    {
      label: 'Supabase',
      state: supabaseConfigured ? 'connected' : 'simulated',
      value: supabaseConfigured ? 'Postgres · persistent' : 'In-memory · demo data',
      detail: supabaseConfigured
        ? 'Row Level Security is on for every table and queries run as your user. Missions, tasks, memory, research and costs survive a restart.'
        : 'Data lives in this server process and is reseeded on restart. Nothing is persisted and there are no accounts.',
    },
    {
      label: 'Owner login',
      state: supabaseConfigured ? 'connected' : 'missing',
      value: supabaseConfigured ? 'Required' : 'None — this workspace is public',
      detail: supabaseConfigured
        ? 'Pages redirect to sign-in and API routes return 401 without a session.'
        : 'There are no accounts in Demo Mode. Anyone who can reach this URL can read this workspace.',
    },
    {
      label: 'Anthropic',
      state: anthropicConfigured ? 'connected' : isDemo ? 'simulated' : 'missing',
      value: anthropicConfigured
        ? config.anthropic.model
        : isDemo
          ? 'Simulated output, prefixed [Simulated]'
          : 'Tasks will stop',
      detail: anthropicConfigured
        ? 'Agents call a real model and every run is costed from the token counts the API returns.'
        : isDemo
          ? 'Agents run on a simulated provider producing schema-valid output. The pipeline is real; the text is not.'
          : 'This is a real workspace, so nothing is simulated. Any task needing a model fails and names what is missing.',
    },
    {
      label: 'Web research',
      state: 'missing',
      value: 'No adapter',
      detail:
        'Agents work from what the model knows and say so. Nothing browses the web, and no agent claims a live source it does not have.',
    },
    {
      label: 'YouTube',
      state: youtube?.connected ? 'connected' : 'missing',
      value: youtube?.connected ? 'Data API' : 'Not connected',
      detail: youtube?.connected
        ? 'Live channel analytics via the official Data API.'
        : 'Analytics screens show only recorded data, and nothing can be published.',
    },
    {
      label: 'Etsy',
      state: etsy?.connected ? 'connected' : 'missing',
      value: etsy?.connected ? 'Open API' : 'Not connected',
      detail: etsy?.connected
        ? 'Listings can be pushed to your shop after approval.'
        : 'Listings are prepared and approved inside Command Centre. Nothing reaches Etsy.',
    },
    {
      label: 'Voice',
      state: providerState(voice),
      value: voice?.simulated ? 'Placeholder narration' : voice?.connected ? voice.name : 'Not connected',
      detail: voice?.simulated
        ? 'Demo Mode placeholder narration, always badged Simulated. Nothing is charged.'
        : voice?.connected
          ? 'Narration is generated by a real provider.'
          : 'Missions stop at the narration step and name the variables needed.',
    },
    {
      label: 'Images',
      state: providerState(image),
      value: image?.simulated ? 'Placeholder stills' : image?.connected ? image.name : 'Not connected',
      detail: image?.simulated
        ? 'Demo Mode placeholder stills, always badged Simulated. Nothing is charged.'
        : image?.connected
          ? 'Scene stills and thumbnails come from a real provider.'
          : 'Missions stop at asset generation rather than faking imagery.',
    },
    {
      label: 'Video',
      state: providerState(video),
      value: video?.simulated ? 'Placeholder clips' : video?.connected ? video.name : 'Not connected',
      detail: 'Generated motion clips. Optional — most scenes do not need them.',
    },
    {
      label: 'Stock media',
      state: providerState(stock),
      value: stock?.simulated ? 'Placeholder footage' : stock?.connected ? stock.name : 'Not connected',
      detail: 'Licensed footage and stills. Nothing scrapes copyrighted media.',
    },
    {
      label: 'Renderer',
      state: providerState(renderer),
      value: renderer?.name ?? 'Local ffmpeg',
      detail: 'Video assembly runs locally on this machine. No third-party render service, and no spend.',
    },
  ];

  return (
    <PageShell
      title="System status"
      description="What this instance actually is. Command Centre behaves differently without Supabase, and this says how."
      tabs={SETTINGS_TABS}
      wide
    >
      {isDemo && (
        <Panel className="mb-4 border-amber-500/25 bg-amber-500/[0.07] p-4">
          <p className="text-[12px] leading-relaxed text-amber-100/80">
            <strong className="font-semibold">This instance has no database and no accounts.</strong>{' '}
            That is correct for local development and wrong for anything else. Configure Supabase,
            run migrations 0001–0006 in order, and create your owner account before putting this
            anywhere reachable. Until then everything here is demo data and nothing survives a
            restart.
          </p>
        </Panel>
      )}

      <Section title="Services">
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-[var(--color-edge-soft)]">
            {rows.map((row) => (
              <li key={row.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
                <span className="w-[110px] shrink-0 text-[13px] font-medium">{row.label}</span>
                <Badge tone={TONE[row.state]}>{LABEL[row.state]}</Badge>
                <span className="text-[12px] text-[var(--color-ink-muted)]">{row.value}</span>
                <span className="min-w-0 flex-1 basis-full text-[12px] leading-relaxed text-[var(--color-ink-muted)] sm:basis-0">
                  {row.detail}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      <Section title="Simulation">
        <Panel className="p-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            {isDemo
              ? simulationAllowed()
                ? 'Demo Mode. A missing provider is stood in for, and everything produced that way is stored as simulated, badged throughout, and never given a public URL. Set DISABLE_SIMULATED_MEDIA=true to make those steps stop instead.'
                : 'Demo Mode with simulated media turned off. A missing provider stops the step and names what it needs.'
              : 'This is a real workspace, so nothing is ever simulated — not the model, not the media. A step whose provider is missing fails and tells you exactly which variable to set. You will never be shown invented output that looks like real output.'}
          </p>
        </Panel>
      </Section>
    </PageShell>
  );
}
