'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pin, PinOff, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Field, Panel, inputClass } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils';
import { memoryBand, type AgentMemory as Memory } from '@/types/domain';

const TYPE_LABELS: Record<string, string> = {
  preference: 'Preference',
  insight: 'Learning',
  fact: 'Business context',
  constraint: 'Rule',
  performance: 'Channel insight',
};

const BAND_TONE = { low: 'neutral', normal: 'emerald', high: 'amber' } as const;

/**
 * An agent's memory, editable.
 *
 * The distinction the panel exists to make visible is *who wrote this*. An
 * agent-written rule and an operator-written rule read identically in a prompt,
 * but they mean very different things when you are working out why an agent
 * behaved the way it did — so every row says which it is.
 */
export function AgentMemoryPanel({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<Memory[]>([]);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ type: 'preference', content: '', importance: 3 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (showArchived) params.set('archived', 'true');
    const response = await fetch(`/api/agents/${agentId}/memory?${params}`);
    if (!response.ok) return;
    const data = await response.json();
    setRows(data.memory ?? []);
  }, [agentId, query, showArchived]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);

  const patch = async (memoryId: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/memory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory_id: memoryId, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (memoryId: string) => {
    setBusy(`delete:${memoryId}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/${agentId}/memory?memory_id=${encodeURIComponent(memoryId)}`,
        { method: 'DELETE' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not delete.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    setBusy('add');
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not add.');
      setDraft({ type: 'preference', content: '', importance: 3 });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[13px] font-semibold">Memory</h2>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="accent-amber-400"
          />
          Show archived
        </label>
        <Button size="sm" variant="secondary" onClick={() => setAdding((open) => !open)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-white/[0.02] px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-faint)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search memories"
          className="w-full bg-transparent py-1.5 text-[12px] outline-none placeholder:text-[var(--color-ink-faint)]"
          aria-label="Search memories"
        />
      </div>

      {adding && (
        <div className="mt-2.5 space-y-2 rounded-xl border border-[var(--color-edge)] p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                className={inputClass}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Importance" hint="5 means it is loaded into every run.">
              <input
                type="number"
                min={1}
                max={5}
                value={draft.importance}
                onChange={(event) => setDraft({ ...draft, importance: Number(event.target.value) })}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Memory">
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. Never use background music on this channel."
            />
          </Field>
          <Button size="sm" loading={busy === 'add'} disabled={draft.content.trim().length < 5} onClick={add}>
            <Save className="h-3.5 w-3.5" />
            Save memory
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[12px] leading-snug text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-2.5 space-y-2">
        {rows.map((row) => {
          const band = memoryBand(row.importance);
          return (
            <li
              key={row.id}
              className={`rounded-xl border p-2.5 ${
                row.status === 'archived'
                  ? 'border-[var(--color-edge-soft)] opacity-60'
                  : row.status === 'pending'
                    ? 'border-amber-500/30 bg-amber-500/[0.05]'
                    : 'border-[var(--color-edge)]'
              }`}
            >
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge>{TYPE_LABELS[row.type] ?? row.type}</Badge>
                <Badge tone={BAND_TONE[band]}>{band}</Badge>
                {/* The distinction that matters when tracing behaviour. */}
                <Badge tone={row.origin === 'owner' ? 'emerald' : 'neutral'}>
                  {row.origin === 'owner' ? 'Owner memory' : 'AI-generated memory'}
                </Badge>
                {row.pinned && <Badge tone="amber">Pinned</Badge>}
                {row.status === 'pending' && <Badge tone="amber">Awaiting approval</Badge>}
                {row.status === 'archived' && <Badge>Archived</Badge>}
              </p>

              {editing === row.id ? (
                <div className="mt-2">
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <Button
                      size="sm"
                      loading={busy === `edit:${row.id}`}
                      onClick={() => patch(row.id, { content: editText }, `edit:${row.id}`)}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-[12.5px] leading-relaxed">{row.content}</p>
              )}

              <p className="mt-1.5 text-[11px] text-[var(--color-ink-faint)]">
                {row.source} · created {formatRelativeTime(row.created_at)} ·{' '}
                {row.last_used_at ? `last used ${formatRelativeTime(row.last_used_at)}` : 'never used'}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `pin:${row.id}`}
                  onClick={() => patch(row.id, { pinned: !row.pinned }, `pin:${row.id}`)}
                >
                  {row.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {row.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(row.id);
                    setEditText(row.content);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `archive:${row.id}`}
                  onClick={() =>
                    patch(row.id, { archived: row.status !== 'archived' }, `archive:${row.id}`)
                  }
                >
                  {row.status === 'archived' ? (
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
                {/* Only offered when it is genuinely safe — a used memory is
                    part of why an agent produced what it produced. */}
                {!row.last_used_at && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy === `delete:${row.id}`}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-4 text-center text-[12px] text-[var(--color-ink-faint)]">
            {query ? `Nothing matches “${query}”.` : 'This agent has learned nothing yet.'}
          </li>
        )}
      </ul>

      <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        Pinned memories load first. Archived memories stop being loaded but stay on the record.
        Memories awaiting approval are not loaded into any run.
      </p>
    </Panel>
  );
}
