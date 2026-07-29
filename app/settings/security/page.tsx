import { getSession } from '@/lib/auth/session';
import { supabaseConfigured } from '@/lib/config';
import { simulationAllowed } from '@/lib/integrations/providers/registry';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { SETTINGS_TABS } from '@/components/settings/tabs';
import { PasswordForm } from '@/components/settings/PasswordForm';
import { AUTHORITY_DESCRIPTIONS } from '@/lib/agents/authority';

export const dynamic = 'force-dynamic';

/**
 * What protects this instance.
 *
 * Everything here is a *property of the running server* — whether RLS is in
 * play, whether keys are server-side, what agents may do unattended. No token,
 * key or session identifier appears on this page.
 */
export default async function SecuritySettingsPage() {
  const { profile, isDemo } = await getSession();

  const posture = [
    {
      label: 'Storage',
      value: supabaseConfigured ? 'Supabase (Postgres)' : 'In-memory (demo)',
      good: supabaseConfigured,
      detail: supabaseConfigured
        ? 'Every table has Row Level Security. Queries run as your user, so the database — not the application — is what stops one account reading another.'
        : 'No database is configured. Data lives in this server process and resets on restart.',
    },
    {
      label: 'Authentication',
      value: supabaseConfigured ? 'Required' : 'Not required',
      good: supabaseConfigured,
      detail: supabaseConfigured
        ? 'Unauthenticated requests are redirected to sign-in, and API routes return 401 rather than data.'
        : 'Demo mode has no accounts. Do not expose this instance publicly without configuring Supabase.',
    },
    {
      label: 'Secret handling',
      value: 'Server-side only',
      good: true,
      detail:
        'Provider keys are read in lib/config.ts, which only server modules import. No AI, voice, image, video or platform key is sent to the browser, and a saved secret is never displayed again.',
    },
    {
      label: 'Simulated media',
      value: simulationAllowed() ? 'Allowed (demo mode)' : 'Off',
      good: !simulationAllowed(),
      detail: simulationAllowed()
        ? 'Missing media providers stand in with placeholder assets, always badged SIMULATED and never given a public URL.'
        : 'Missing providers stop the mission and say what is missing. Nothing is ever faked.',
    },
  ];

  return (
    <PageShell
      title="Security"
      description="What actually protects this instance. Nothing on this page is a secret."
      tabs={SETTINGS_TABS}
      wide
    >
      <Section title="Posture">
        <div className="grid gap-3 md:grid-cols-2">
          {posture.map((item) => (
            <Panel key={item.label} className="p-4">
              <p className="flex items-start justify-between gap-3">
                <span className="text-[13px] font-medium">{item.label}</span>
                <Badge tone={item.good ? 'emerald' : 'amber'}>{item.value}</Badge>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                {item.detail}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Password">
        <Panel className="p-4">
          <PasswordForm email={profile.email} />
        </Panel>
      </Section>

      <Section title="What agents may do unattended">
        <Panel className="p-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            Spending money, purchasing, publishing publicly, sending external messages, deleting
            important data and changing account settings always stop and ask you, regardless of an
            agent&rsquo;s authority level, unless the task carries an explicit authorisation for
            that exact action.
          </p>
          <dl className="mt-3 space-y-2">
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <div key={level} className="flex gap-3">
                <dt className="w-[68px] shrink-0 font-mono text-[11px] text-amber-400">
                  Level {level}
                </dt>
                <dd className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                  <span className="text-[var(--color-ink)]">
                    {AUTHORITY_DESCRIPTIONS[level].name}
                  </span>{' '}
                  — {AUTHORITY_DESCRIPTIONS[level].detail}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </Section>

      {isDemo && (
        <Section title="Before you deploy">
          <Panel className="p-4">
            <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              This instance has no authentication. Configure Supabase, run both migrations, create
              your owner account, and disable public sign-ups in the Supabase dashboard so nobody
              else can register against your project. The README covers each step.
            </p>
          </Panel>
        </Section>
      )}
    </PageShell>
  );
}
