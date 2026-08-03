'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Hammer, Sparkles, X } from 'lucide-react';
import { Badge, Button, DemoNotice, EmptyState, Field, Panel, inputClass } from '@/components/ui';
import { ScoreBar, Section } from '@/components/layout/PageShell';
import type { EtsyOpportunity } from '@/types/domain';

const STATUS_TONE: Record<EtsyOpportunity['status'], 'neutral' | 'emerald' | 'red' | 'amber'> = {
  proposed: 'neutral',
  approved: 'emerald',
  rejected: 'red',
  saved: 'amber',
};

export function OpportunitiesBoard({
  opportunities,
  businessId,
  defaultNiche,
}: {
  opportunities: EtsyOpportunity[];
  businessId: string;
  defaultNiche: string;
}) {
  const router = useRouter();
  const [niche, setNiche] = useState(defaultNiche);
  const [count, setCount] = useState(6);
  const [instructions, setInstructions] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const generate = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/etsy/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, niche, count, instructions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Research failed.');
      const failed = data.run?.results?.find((r: { status: string }) => r.status === 'failed');
      if (failed) throw new Error(failed.error ?? 'The researcher could not complete the task.');
      setNotice(`${data.opportunities?.length ?? 0} opportunities found.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed.');
    } finally {
      setRunning(false);
    }
  };

  const decide = async (
    id: string,
    status: EtsyOpportunity['status'],
    startBuild: boolean,
  ) => {
    setDeciding(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/etsy/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, start_build: startBuild }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The decision could not be recorded.');
      if (data.mission) {
        router.push(`/missions/${data.mission.id}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be recorded.');
    } finally {
      setDeciding(null);
    }
  };

  const sorted = [...opportunities].sort((a, b) => b.score - a.score);

  return (
    <>
      <Section title="Find product opportunities">
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Niche">
              <input
                value={niche}
                onChange={(event) => setNiche(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="How many">
              <input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Additional instructions">
              <input
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={generate} loading={running} disabled={!niche.trim()}>
              <Sparkles className="h-3.5 w-3.5" />
              Research opportunities
            </Button>
            <span className="text-[11px] text-[var(--color-ink-faint)]">
              Digital products only. Nothing is listed or published without your approval.
            </span>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
              {notice}
            </p>
          )}
        </Panel>
      </Section>

      <Section title={`Opportunities · ${opportunities.length}`}>
        {sorted.length === 0 ? (
          <Panel>
            <EmptyState title="No opportunities yet" detail="Run the researcher above." />
          </Panel>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sorted.map((opportunity) => (
              <Panel key={opportunity.id} className="p-4">
                <header className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-medium leading-snug">{opportunity.product}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                      <Badge tone={STATUS_TONE[opportunity.status]}>{opportunity.status}</Badge>
                      <span>{opportunity.pricing_range}</span>
                      {opportunity.is_demo && <DemoNotice />}
                    </p>
                  </div>
                  <ScoreBar score={opportunity.score} className="shrink-0" />
                </header>

                <dl className="mt-3 space-y-1.5 text-[12px]">
                  <Row label="Buyer" value={opportunity.target_customer} />
                  <Row label="Problem" value={opportunity.problem} />
                  <Row label="Demand" value={opportunity.demand} />
                  <Row label="Competition" value={opportunity.competition} />
                  <Row label="Seasonality" value={opportunity.seasonality} />
                  <Row label="Effort" value={opportunity.production_difficulty} />
                  <Row label="Profit" value={opportunity.profit_potential} />
                </dl>

                {opportunity.status === 'proposed' && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-edge)] pt-3">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={deciding === opportunity.id}
                      onClick={() => decide(opportunity.id, 'approved', true)}
                    >
                      <Hammer className="h-3.5 w-3.5" />
                      Build this product
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={deciding === opportunity.id}
                      onClick={() => decide(opportunity.id, 'saved', false)}
                    >
                      Save for later
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deciding === opportunity.id}
                      onClick={() => decide(opportunity.id, 'rejected', false)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[86px] shrink-0 text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 leading-snug text-[var(--color-ink-muted)]">{value}</dd>
    </div>
  );
}
