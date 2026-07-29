'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, Panel } from '@/components/ui';
import type { WorkloadBand } from '@/lib/operations/today';

const BAND_TONE: Record<WorkloadBand, 'neutral' | 'emerald' | 'amber' | 'red'> = {
  idle: 'neutral',
  light: 'emerald',
  busy: 'amber',
  overloaded: 'red',
};

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  role: string;
  colour: string;
  capabilities: string[];
  band: WorkloadBand;
}

/**
 * Assigns agents to a business, or returns them to the shared pool.
 *
 * Removing an agent from a business makes it shared. It never deletes the
 * agent, and the button says so — losing an agent by trying to tidy up which
 * channel it belongs to would be an unpleasant surprise.
 */
export function AgentAssignment({
  businessId,
  businessName,
  agents,
  mode,
}: {
  businessId: string;
  businessName: string;
  agents: AgentRow[];
  mode: 'core' | 'shared';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (agentId: string, action: 'assign' | 'unassign') => {
    setBusy(agentId);
    setError(null);
    try {
      const response = await fetch(`/api/businesses/${businessId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'That could not be changed.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be changed.');
    } finally {
      setBusy(null);
    }
  };

  if (agents.length === 0) {
    return (
      <Panel>
        <EmptyState
          title={mode === 'core' ? 'No agents scoped to this business' : 'No shared agents'}
          detail={
            mode === 'core'
              ? 'Assign a shared agent below, or create one from Agents → Create agent.'
              : 'Every agent belongs to a business.'
          }
        />
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {error && (
        <p className="border-b border-red-500/25 bg-red-500/10 px-3.5 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}
      <ul className="divide-y divide-[var(--color-edge-soft)]">
        {agents.map((agent) => (
          <li key={agent.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
            <span
              aria-hidden
              className="h-6 w-6 shrink-0 rounded-full"
              style={{
                background: `radial-gradient(circle at 32% 30%, ${agent.colour}dd, ${agent.colour}66 62%, #05070f)`,
              }}
            />
            <span className="min-w-0 flex-1">
              <Link
                href={`/agents/${agent.slug}`}
                className="block truncate text-[13px] underline-offset-4 hover:underline"
              >
                {agent.name}
              </Link>
              <span className="block truncate text-[11px] text-[var(--color-ink-faint)]">
                {agent.role || agent.capabilities.slice(0, 2).join(', ')}
              </span>
            </span>
            <Badge tone={BAND_TONE[agent.band]}>{agent.band}</Badge>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === agent.id}
              onClick={() => change(agent.id, mode === 'core' ? 'unassign' : 'assign')}
            >
              {mode === 'core' ? (
                <>
                  <Minus className="h-3.5 w-3.5" />
                  Make shared
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Assign to {businessName}
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
