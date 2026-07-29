import { getSession } from '@/lib/auth/session';
import { permissionsFor, ROLE_DESCRIPTIONS } from '@/lib/auth/permissions';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { SETTINGS_TABS } from '@/components/settings/tabs';
import { AccountForm } from '@/components/settings/AccountForm';
import { SessionPanel } from '@/components/settings/SessionPanel';

export const dynamic = 'force-dynamic';

/** Who you are signed in as, and what that lets you do. */
export default async function AccountSettingsPage() {
  const { profile, role, isDemo } = await getSession();
  const permissions = permissionsFor(role);

  return (
    <PageShell
      title="Account"
      description="Your profile, session and what your role permits."
      tabs={SETTINGS_TABS}
      wide
    >
      <Section title="Profile">
        <Panel className="p-4">
          {isDemo && (
            <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-amber-100/80">
              <strong className="font-semibold">Demo mode.</strong> There is no account behind
              this profile — it exists so the screen is real rather than a mock-up. Changes are
              kept in memory and reset when the server restarts.
            </p>
          )}
          <AccountForm profile={profile} editable />
        </Panel>
      </Section>

      <Section title="Role">
        <Panel className="p-4">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">{role}</Badge>
            <span className="text-[13px] text-[var(--color-ink-muted)]">
              {ROLE_DESCRIPTIONS[role]}
            </span>
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
            Permitted
          </p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            {permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]"
              >
                {permission}
              </span>
            ))}
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
            Command Centre is single-owner today. The other roles — admin, member, viewer — are
            defined and enforced server-side so team access can be added later without revisiting
            every route. A role cannot be changed from the browser.
          </p>
        </Panel>
      </Section>

      <Section title="Session">
        <Panel className="p-4">
          <SessionPanel />
        </Panel>
      </Section>
    </PageShell>
  );
}
