import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { config } from '@/lib/config';
import { getAiBudget, monthToDateSpend } from '@/lib/finance/ai-budget';
import { PageShell, Section } from '@/components/layout/PageShell';
import { SETTINGS_TABS } from '@/components/settings/tabs';
import { AiBudgetForm } from '@/components/settings/AiBudgetForm';
import { Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AiBudgetPage() {
  const { store, ownerId, role, isDemo } = await getSession();
  if (!can(role, 'ai_budget.manage')) redirect('/settings');

  const [budget, spentThisMonth] = await Promise.all([
    getAiBudget(store, ownerId),
    monthToDateSpend(store, ownerId),
  ]);

  return (
    <PageShell
      title="AI budget"
      description="What the whole workforce may spend on model calls in a calendar month."
      tabs={SETTINGS_TABS}
    >
      {isDemo && (
        <Panel className="mb-4 border-[var(--color-edge)] bg-white/[0.02] p-4">
          <p className="text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
            This is Demo Mode, where agents run on a simulated provider and nothing costs anything,
            so no budget is required. These figures are stored but only take effect in a real
            workspace with Supabase and Anthropic connected.
          </p>
        </Panel>
      )}

      <Section title="Monthly ceiling">
        <AiBudgetForm
          budget={budget}
          spentThisMonth={spentThisMonth}
          currency={budget?.currency ?? config.currency}
        />
      </Section>
    </PageShell>
  );
}
