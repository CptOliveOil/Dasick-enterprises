'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Field, Panel, inputClass } from '@/components/ui';
import { COLOUR_PRESETS } from '@/lib/agents/presets';
import type { BusinessKind } from '@/types/domain';

interface TemplateOption {
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  businessKind: string | null;
  islamic: boolean;
  coveredByShared: boolean;
}

const KIND_TEMPLATES: { key: BusinessKind; label: string; detail: string; colour: string }[] = [
  {
    key: 'youtube',
    label: 'YouTube channel',
    detail: 'Ideas, research, scripting and the full faceless production pipeline.',
    colour: '#ef4444',
  },
  {
    key: 'etsy',
    label: 'Etsy store',
    detail: 'Product opportunity research and listing copy.',
    colour: '#f97316',
  },
  {
    key: 'generic',
    label: 'Custom project',
    detail: 'A business with no workspace module — agents, missions and finance only.',
    colour: '#3b82f6',
  },
];

/**
 * Creates a business and, optionally, the agents that make it usable on day one.
 *
 * Templates already covered by a shared agent are shown as covered rather than
 * offered — a second Manager would compete for the same work and split its
 * history in two.
 */
export function NewBusinessForm({ templates }: { templates: TemplateOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<BusinessKind>('youtube');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colour, setColour] = useState('#ef4444');
  const [currency, setCurrency] = useState('GBP');
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [language, setLanguage] = useState('English');
  const [duration, setDuration] = useState(8);
  const [style, setStyle] = useState('');
  const [budget, setBudget] = useState(25);
  const [islamic, setIslamic] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relevant = templates.filter((template) => {
    if (template.islamic) return islamic;
    if (!template.businessKind) return true;
    return template.businessKind === kind;
  });

  const toggle = (key: string) =>
    setChosen((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );

  const pickKind = (next: BusinessKind) => {
    setKind(next);
    const preset = KIND_TEMPLATES.find((entry) => entry.key === next);
    if (preset) setColour(preset.colour);
    setChosen([]);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          kind,
          description,
          colour,
          currency,
          islamic,
          agent_templates: chosen,
          ...(kind === 'youtube'
            ? {
                channel: {
                  niche,
                  target_audience: audience,
                  language,
                  default_duration_minutes: duration,
                  content_style: style,
                },
                budget,
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The business could not be created.');
      router.push(`/businesses/${data.business.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The business could not be created.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Type</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {KIND_TEMPLATES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => pickKind(entry.key)}
              aria-pressed={kind === entry.key}
              className={`rounded-xl border p-3 text-left transition-colors ${
                kind === entry.key
                  ? 'border-amber-400/60 bg-amber-400/[0.07]'
                  : 'border-[var(--color-edge)] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              <span className="block text-[13px] font-medium">{entry.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                {entry.detail}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              maxLength={80}
              placeholder={kind === 'youtube' ? 'History Channel' : 'My Store'}
            />
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className={inputClass}
            >
              {['GBP', 'USD', 'EUR', 'AED', 'CAD', 'AUD'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              maxLength={1000}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Accent colour" hint="Used for this business throughout the interface.">
            <div className="flex flex-wrap gap-1.5">
              {COLOUR_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setColour(preset.colour)}
                  aria-pressed={colour === preset.colour}
                  title={preset.label}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    colour === preset.colour
                      ? 'scale-110 border-white/80'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.colour }}
                />
              ))}
            </div>
          </Field>
        </div>
      </Panel>

      {kind === 'youtube' && (
        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Channel profile</h2>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            All optional. These reach the research and scripting agents as context.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Niche">
              <input
                value={niche}
                onChange={(event) => setNiche(event.target.value)}
                className={inputClass}
                maxLength={200}
                placeholder="Ancient history mysteries"
              />
            </Field>
            <Field label="Target audience">
              <input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className={inputClass}
                maxLength={200}
                placeholder="Adults 25–54"
              />
            </Field>
            <Field label="Language">
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className={inputClass}
                maxLength={60}
              />
            </Field>
            <Field label="Default video length (minutes)">
              <input
                type="number"
                min={1}
                max={120}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Content style">
              <input
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                className={inputClass}
                maxLength={200}
                placeholder="Measured documentary narration"
              />
            </Field>
            <Field label="Budget per video" hint="Hard ceiling. Agents never spend past it.">
              <input
                type="number"
                min={0}
                max={1000}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={islamic}
              onChange={(event) => setIslamic(event.target.checked)}
              className="mt-0.5 accent-amber-400"
            />
            <span>
              <span className="block text-[12.5px]">Islamic content</span>
              <span className="block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                Adds a Source Policy and visual rules for this channel, with conservative defaults,
                and offers the Islamic specialist agents below. No madhhab or position is assumed.
              </span>
            </span>
          </label>
        </Panel>
      )}

      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Agents</h2>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Created scoped to this business, so their memory and work stay with it. Anything already
          covered by a shared agent is not offered again.
        </p>
        <div className="mt-3 space-y-2">
          {relevant.map((template) => (
            <label
              key={template.key}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 ${
                template.coveredByShared
                  ? 'border-[var(--color-edge-soft)] opacity-60'
                  : 'cursor-pointer border-[var(--color-edge)] hover:bg-white/[0.04]'
              }`}
            >
              <input
                type="checkbox"
                disabled={template.coveredByShared}
                checked={chosen.includes(template.key)}
                onChange={() => toggle(template.key)}
                className="mt-0.5 accent-amber-400"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px]">{template.name}</span>
                  {template.coveredByShared && <Badge>Already covered by a shared agent</Badge>}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  {template.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Panel>

      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      <Button variant="primary" onClick={submit} loading={saving} disabled={name.trim().length < 2}>
        <Plus className="h-3.5 w-3.5" />
        Create business
      </Button>
    </div>
  );
}
