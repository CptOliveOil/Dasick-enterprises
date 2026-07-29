'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { AUTHORITY_DESCRIPTIONS } from '@/lib/agents/authority';
import { AgentInspector } from '@/components/agents/AgentInspector';
import { AgentIdentity } from '@/components/agents/AgentIdentity';
import { Button, EmptyState, Field, Panel, PanelHeader, inputClass } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import type { AuthorityLevel } from '@/types/domain';

/** Full-page agent view: the inspector, plus the settings the inspector omits. */
export default function AgentPage() {
  const params = useParams<{ slug: string }>();
  const agent = useWorkforce(
    (s) => s.snapshot?.agents.find((a) => a.slug === params.slug) ?? null,
  );
  const loading = useWorkforce((s) => s.loading);
  const refresh = useWorkforce((s) => s.refresh);
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;

  const [prompt, setPrompt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [authority, setAuthority] = useState<AuthorityLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!agent) {
    return (
      <PageShell title="Agent">
        <Panel>
          <EmptyState
            title={loading ? 'Loading…' : 'No such agent'}
            detail={loading ? undefined : 'This agent does not exist in the current workforce.'}
          />
        </Panel>
      </PageShell>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: prompt ?? agent.system_prompt,
          model: model ?? agent.model,
          temperature: temperature ?? agent.temperature,
          max_tokens: maxTokens ?? agent.max_tokens,
          authority_level: authority ?? agent.authority_level,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not save.');
      }
      setSaved(true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title={agent.name} description={agent.description} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Section title="Identity and capabilities">
            <AgentIdentity
              agent={agent}
              businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
              onSaved={refresh}
            />
          </Section>

          <Section title="Instructions">
            <Panel className="p-4">
              <Field
                label="System prompt"
                hint="Sent as the system message on every run of this agent."
              >
                <textarea
                  value={prompt ?? agent.system_prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={9}
                  className={`${inputClass} resize-y font-mono text-[12px] leading-relaxed`}
                />
              </Field>
            </Panel>
          </Section>

          <Section title="Model settings">
            <Panel className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Model">
                <input
                  value={model ?? agent.model}
                  onChange={(event) => setModel(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Provider" hint="Change providers in Settings → AI Providers.">
                <input value={agent.provider} readOnly className={`${inputClass} opacity-60`} />
              </Field>
              <Field label={`Temperature — ${(temperature ?? agent.temperature).toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature ?? agent.temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                  className="w-full accent-amber-400"
                />
              </Field>
              <Field label="Token limit">
                <input
                  type="number"
                  min={256}
                  max={64000}
                  value={maxTokens ?? agent.max_tokens}
                  onChange={(event) => setMaxTokens(Number(event.target.value))}
                  className={inputClass}
                />
              </Field>
            </Panel>
          </Section>

          <Section title="Authority">
            <Panel className="p-2">
              {(Object.keys(AUTHORITY_DESCRIPTIONS) as unknown as string[]).map((key) => {
                const level = Number(key) as AuthorityLevel;
                const info = AUTHORITY_DESCRIPTIONS[level];
                const current = (authority ?? agent.authority_level) === level;
                return (
                  <label
                    key={level}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ${
                      current ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="authority"
                      checked={current}
                      onChange={() => setAuthority(level)}
                      className="mt-1 accent-amber-400"
                    />
                    <span>
                      <span className="block text-[13px]">
                        Level {level} — {info.name}
                      </span>
                      <span className="block text-[12px] leading-snug text-[var(--color-ink-muted)]">
                        {info.detail}
                      </span>
                    </span>
                  </label>
                );
              })}
              <p className="px-3 py-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                Spending, purchasing, publishing, external messaging, deleting important data and
                changing account settings always stop for approval, at every level, unless the
                task carries an explicit authorisation.
              </p>
            </Panel>
          </Section>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save} loading={saving}>
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
            {saved && <span className="text-[12px] text-emerald-300">Saved.</span>}
            {error && <span className="text-[12px] text-red-300">{error}</span>}
          </div>
        </div>

        <Panel className="h-fit overflow-hidden lg:sticky lg:top-4">
          <PanelHeader title="Inspector" />
          <div className="h-[70vh]">
            <AgentInspector agent={agent} />
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
