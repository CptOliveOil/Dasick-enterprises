'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge, Button, Field, Panel, inputClass } from '@/components/ui';
import { AUTHORITY_DESCRIPTIONS } from '@/lib/agents/authority';
import { AGENT_TYPES, type AgentType, type AuthorityLevel } from '@/types/domain';
import type { CapabilityGroup } from '@/lib/agents/catalogue';
import type { AgentTemplate } from '@/lib/agents/templates';
import type { ColourPreset, RingPreset, SizePreset } from '@/lib/agents/presets';

interface BusinessOption {
  id: string;
  name: string;
  kind: string;
}

const MEMORY_LABELS: Record<string, string> = {
  none: 'None — runs stateless',
  business: 'This business only (recommended)',
  agent: 'Everything this agent has learned, across businesses',
};

/**
 * Builds an agent.
 *
 * Capabilities come from the server as a fixed list, so nothing arbitrary can
 * be typed in. Everything else is a normal form — the server re-validates all
 * of it regardless.
 */
export function AgentBuilder({
  templates,
  groups,
  businesses,
  colours,
  sizes,
  rings,
  symbols,
}: {
  templates: AgentTemplate[];
  groups: CapabilityGroup[];
  businesses: BusinessOption[];
  colours: ColourPreset[];
  sizes: SizePreset[];
  rings: RingPreset[];
  symbols: string[];
}) {
  const router = useRouter();
  const [templateKey, setTemplateKey] = useState('custom');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [businessId, setBusinessId] = useState<string>('');
  const [agentType, setAgentType] = useState<AgentType>('custom');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [authority, setAuthority] = useState<AuthorityLevel>(1);
  const [memoryAccess, setMemoryAccess] = useState('business');
  const [colour, setColour] = useState('emerald');
  const [size, setSize] = useState('medium');
  const [ring, setRing] = useState('none');
  const [symbol, setSymbol] = useState<string>('Sparkles');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const template = templates.find((t) => t.key === key);
    if (!template) return;
    // Prefill, never lock. Everything below stays editable.
    if (template.key !== 'custom') setName(template.name);
    setRole(template.role);
    setDescription(template.description);
    setAgentType(template.agent_type);
    setSystemPrompt(template.system_prompt);
    setCapabilities(template.capabilities);
    setAuthority(template.authority_level);
    setMemoryAccess(template.memory_access);
    setColour(template.appearance.colour);
    setSize(template.appearance.size);
    setRing(template.appearance.ring);
    if (template.appearance.symbol) setSymbol(template.appearance.symbol);

    if (template.business_kind) {
      const match = businesses.find((b) => b.kind === template.business_kind);
      if (match) setBusinessId(match.id);
    }
  };

  const toggle = (capability: string) => {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((c) => c !== capability)
        : [...current, capability],
    );
  };

  const preview = useMemo(() => {
    const chosen = colours.find((c) => c.key === colour) ?? colours[0]!;
    const chosenSize = sizes.find((s) => s.key === size) ?? sizes[1]!;
    const chosenRing = rings.find((r) => r.key === ring) ?? rings[0]!;
    return { chosen, chosenSize, chosenRing };
  }, [colour, size, ring, colours, sizes, rings]);

  const valid = name.trim().length >= 2 && systemPrompt.trim().length >= 20 && capabilities.length > 0;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_key: templateKey === 'custom' ? null : templateKey,
          name,
          role,
          description,
          business_id: businessId || null,
          agent_type: agentType,
          provider,
          model,
          system_prompt: systemPrompt,
          capabilities,
          authority_level: authority,
          memory_access: memoryAccess,
          appearance: { colour, size, ring, symbol },
          enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The agent could not be created.');
      router.push(`/agents/${data.slug}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The agent could not be created.');
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Start from a template</h2>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            A template only fills the form in. Every field below stays editable.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => applyTemplate(template.key)}
                aria-pressed={templateKey === template.key}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  templateKey === template.key
                    ? 'border-amber-400/60 bg-amber-400/[0.07]'
                    : 'border-[var(--color-edge)] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <span className="block text-[13px] font-medium">{template.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  {template.description || 'A blank agent you describe yourself.'}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Identity</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Agent name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
                maxLength={80}
                placeholder="Islamic Content Researcher"
              />
            </Field>
            <Field label="Role">
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={inputClass}
                maxLength={120}
                placeholder="Sourced Islamic research"
              />
            </Field>
            <Field label="Business">
              <select
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
                className={inputClass}
              >
                <option value="">Global — available to every business</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Agent type">
              <select
                value={agentType}
                onChange={(event) => setAgentType(event.target.value as AgentType)}
                className={inputClass}
              >
                {AGENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type[0]!.toUpperCase() + type.slice(1)}
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
                maxLength={2000}
              />
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
            Scoping an agent to a business keeps its memory and work with that channel. A general
            YouTube mission will not pick up an agent scoped to a different one.
          </p>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Capabilities</h2>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            Only capabilities with a registered handler are listed — an agent cannot be given work
            nothing can execute.
          </p>
          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                  {group.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  {group.description}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.capabilities.map((item) => {
                    const on = capabilities.includes(item.capability);
                    return (
                      <button
                        key={item.capability}
                        type="button"
                        onClick={() => toggle(item.capability)}
                        aria-pressed={on}
                        title={item.label}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                          on
                            ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                            : 'border-[var(--color-edge)] bg-white/[0.03] text-[var(--color-ink-muted)] hover:bg-white/[0.07]'
                        }`}
                      >
                        {item.capability}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Instructions</h2>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            Loaded into every run alongside the business context, this agent&rsquo;s memory, the
            task and any upstream step outputs.
          </p>
          <textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            rows={12}
            className={`${inputClass} mt-3 resize-y font-mono text-[12px] leading-relaxed`}
            maxLength={20_000}
          />
          <p className="mt-1 text-right text-[11px] text-[var(--color-ink-faint)]">
            {systemPrompt.length.toLocaleString('en-GB')} / 20,000
          </p>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Authority and memory</h2>
          <div className="mt-3 space-y-2">
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <label
                key={level}
                className={`flex cursor-pointer gap-3 rounded-xl border p-2.5 transition-colors ${
                  authority === level
                    ? 'border-amber-400/60 bg-amber-400/[0.07]'
                    : 'border-[var(--color-edge)] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="radio"
                  name="authority"
                  checked={authority === level}
                  onChange={() => setAuthority(level)}
                  className="mt-0.5 accent-amber-400"
                />
                <span className="min-w-0">
                  <span className="block text-[12px]">
                    <span className="font-mono text-amber-400">Level {level}</span> ·{' '}
                    {AUTHORITY_DESCRIPTIONS[level].name}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--color-ink-faint)]">
                    {AUTHORITY_DESCRIPTIONS[level].detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            Regardless of level, spending, purchasing, publishing, external messaging, deleting and
            changing settings always stop for your approval unless the task carries an explicit
            authorisation for that exact action.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Memory access">
              <select
                value={memoryAccess}
                onChange={(event) => setMemoryAccess(event.target.value)}
                className={inputClass}
              >
                {Object.entries(MEMORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className={inputClass}
                maxLength={120}
              />
            </Field>
            <Field label="Provider">
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className={inputClass}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="mock">Simulated</option>
              </select>
            </Field>
            <Field label="Enabled">
              <select
                value={enabled ? 'yes' : 'no'}
                onChange={(event) => setEnabled(event.target.value === 'yes')}
                className={inputClass}
              >
                <option value="yes">Enabled — can be assigned work</option>
                <option value="no">Disabled — created but idle</option>
              </select>
            </Field>
          </div>
        </Panel>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Panel className="p-4">
          <h2 className="text-[13px] font-semibold">Planet</h2>

          <div className="mt-3 flex items-center justify-center py-3">
            <span className="relative flex items-center justify-center">
              {preview.chosenRing.ring && (
                <span
                  className="absolute rounded-[50%] border"
                  style={{
                    width: preview.chosenSize.radius * 150,
                    height: preview.chosenSize.radius * 46,
                    borderColor: `${preview.chosen.atmosphere}66`,
                    transform: 'rotate(-16deg)',
                  }}
                />
              )}
              <span
                className="rounded-full"
                style={{
                  width: preview.chosenSize.radius * 105,
                  height: preview.chosenSize.radius * 105,
                  background: `radial-gradient(circle at 32% 30%, ${preview.chosen.atmosphere}, ${preview.chosen.colour} 62%, #05070f)`,
                  boxShadow: `0 0 26px ${preview.chosen.colour}55`,
                }}
              />
            </span>
          </div>

          <Field label="Colour">
            <div className="flex flex-wrap gap-1.5">
              {colours.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setColour(preset.key)}
                  aria-pressed={colour === preset.key}
                  title={`${preset.label} — ${preset.meaning}`}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    colour === preset.key
                      ? 'scale-110 border-white/80'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{
                    background: `radial-gradient(circle at 32% 30%, ${preset.atmosphere}, ${preset.colour} 65%)`,
                  }}
                />
              ))}
            </div>
          </Field>
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-faint)]">
            {colours.find((c) => c.key === colour)?.meaning}
          </p>

          <div className="mt-3 space-y-3">
            <Field label="Size">
              <select
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className={inputClass}
              >
                {sizes.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ring and surface">
              <select
                value={ring}
                onChange={(event) => setRing(event.target.value)}
                className={inputClass}
              >
                {rings.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Symbol">
              <select
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                className={inputClass}
              >
                {symbols.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            Orbit and speed are worked out for you so planets do not overlap. Status colour still
            comes from what the agent is actually doing — appearance never fakes activity.
          </p>
        </Panel>

        <Panel className="p-4">
          <p className="flex flex-wrap items-center gap-1.5">
            <Badge tone={capabilities.length > 0 ? 'emerald' : 'neutral'}>
              {capabilities.length} capabilit{capabilities.length === 1 ? 'y' : 'ies'}
            </Badge>
            <Badge>Level {authority}</Badge>
            {!enabled && <Badge tone="amber">Disabled</Badge>}
          </p>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-300">
              {error}
            </p>
          )}

          <Button
            className="mt-3 w-full"
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={!valid}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create agent
          </Button>
          {!valid && (
            <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
              Needs a name, instructions of at least 20 characters, and one capability.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
