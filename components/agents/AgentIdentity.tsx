'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Panel, inputClass } from '@/components/ui';
import { COLOUR_PRESETS, RING_PRESETS, SIZE_PRESETS, SYMBOL_PRESETS, appearanceOf } from '@/lib/agents/presets';
import { AGENT_TYPES, type Agent, type AgentType } from '@/types/domain';
import type { CapabilityGroup } from '@/lib/agents/catalogue';

const MEMORY_LABELS: Record<string, string> = {
  none: 'None — runs stateless',
  business: 'This business only (recommended)',
  agent: 'Everything this agent has learned, across businesses',
};

/**
 * Everything about an agent that is not its prompt or model settings: what it
 * is, what it can do, where it works, how it looks — plus duplicate and
 * archive.
 *
 * There is no delete. Tasks, activity and costs all point at an agent, so
 * removing the row would leave a mission whose history says "someone did this".
 */
export function AgentIdentity({
  agent,
  businesses,
  onSaved,
}: {
  agent: Agent;
  businesses: { id: string; name: string }[];
  onSaved: () => Promise<void> | void;
}) {
  const router = useRouter();
  const initial = appearanceOf(agent.visual);

  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [description, setDescription] = useState(agent.description);
  const [businessId, setBusinessId] = useState(agent.business_id ?? '');
  const [agentType, setAgentType] = useState<AgentType>(agent.agent_type);
  const [memoryAccess, setMemoryAccess] = useState(agent.memory_access);
  const [capabilities, setCapabilities] = useState<string[]>(agent.capabilities);
  const [colour, setColour] = useState(initial.colour);
  const [size, setSize] = useState(initial.size);
  const [ring, setRing] = useState(initial.ring);
  const [symbol, setSymbol] = useState(initial.symbol ?? 'Sparkles');
  const [groups, setGroups] = useState<CapabilityGroup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((response) => response.json())
      .then((data) => setGroups(data.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  const patch = async (body: Record<string, unknown>, action: string) => {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      setMessage({ ok: true, text: 'Saved.' });
      await onSaved();
      router.refresh();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Could not save.',
      });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy('duplicate');
    setMessage(null);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not duplicate.');
      await onSaved();
      router.push(`/agents/${data.slug}`);
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Could not duplicate.',
      });
      setBusy(null);
    }
  };

  const toggle = (capability: string) =>
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((c) => c !== capability)
        : [...current, capability],
    );

  const archived = Boolean(agent.archived_at);

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[13px] font-semibold">Identity</h2>
        {agent.is_custom && <Badge tone="emerald">Custom</Badge>}
        {agent.template_key && <Badge>from {agent.template_key}</Badge>}
        {archived && <Badge tone="amber">Archived</Badge>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            maxLength={80}
          />
        </Field>
        <Field label="Role">
          <input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={inputClass}
            maxLength={120}
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
        <Field
          label="Memory access"
          hint="Business scope keeps one channel's learned preferences out of another's prompt."
        >
          <select
            value={memoryAccess}
            onChange={(event) => setMemoryAccess(event.target.value as Agent['memory_access'])}
            className={inputClass}
          >
            {Object.entries(MEMORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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

      <p className="mt-4 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        Capabilities
      </p>
      <div className="mt-1.5 space-y-2.5">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="text-[11px] text-[var(--color-ink-faint)]">{group.label}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
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
        {groups.length === 0 && (
          <p className="text-[12px] text-[var(--color-ink-faint)]">Loading capabilities…</p>
        )}
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        Planet appearance
      </p>
      <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
        <Field label="Colour">
          <select
            value={colour}
            onChange={(event) => setColour(event.target.value)}
            className={inputClass}
          >
            {COLOUR_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label} — {preset.meaning}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <select
            value={size}
            onChange={(event) => setSize(event.target.value)}
            className={inputClass}
          >
            {SIZE_PRESETS.map((preset) => (
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
            {RING_PRESETS.map((preset) => (
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
            {SYMBOL_PRESETS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-ink-faint)]">
        Orbit and speed stay as they are, so a colour change does not teleport the planet across
        the galaxy.
      </p>

      {message && (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-[12px] leading-snug ${
            message.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          loading={busy === 'save'}
          disabled={capabilities.length === 0 || name.trim().length < 2}
          onClick={() =>
            patch(
              {
                name,
                role,
                description,
                business_id: businessId || null,
                agent_type: agentType,
                memory_access: memoryAccess,
                capabilities,
                appearance: { colour, size, ring, symbol },
              },
              'save',
            )
          }
        >
          Save identity
        </Button>

        <Button size="sm" variant="secondary" loading={busy === 'duplicate'} onClick={duplicate}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>

        {agent.status !== 'disabled' && !archived && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'disable'}
            onClick={() => patch({ status: 'disabled' }, 'disable')}
          >
            Disable
          </Button>
        )}
        {agent.status === 'disabled' && !archived && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'enable'}
            onClick={() => patch({ status: 'idle' }, 'enable')}
          >
            Enable
          </Button>
        )}

        <Button
          size="sm"
          variant={archived ? 'secondary' : 'danger'}
          loading={busy === 'archive'}
          onClick={() => patch({ archived: !archived }, 'archive')}
        >
          {archived ? (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archive
            </>
          )}
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        Archiving stops an agent being assigned new work but keeps every task, cost and activity
        record it produced. Agents are never deleted — that would orphan the history of missions
        it worked on.
      </p>
    </Panel>
  );
}
