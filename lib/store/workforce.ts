'use client';

import { create } from 'zustand';
import type { WorkforceSnapshot } from '@/types/state';

/**
 * Selectors must return referentially stable values. Returning a fresh `[]`
 * while the snapshot is still loading makes useSyncExternalStore believe the
 * store changed on every render, which loops until React gives up.
 */
export const EMPTY = Object.freeze([]) as unknown as never[];

export type Selection =
  | { type: 'agent'; id: string }
  | { type: 'mission'; id: string }
  | null;

interface WorkforceState {
  snapshot: WorkforceSnapshot | null;
  loading: boolean;
  error: string | null;
  /** Set while a command or approval is in flight. */
  busy: string | null;
  selection: Selection;
  hoveredAgentId: string | null;
  activityOpen: boolean;

  refresh: () => Promise<void>;
  setBusy: (label: string | null) => void;
  select: (selection: Selection) => void;
  hover: (agentId: string | null) => void;
  toggleActivity: () => void;
}

export const useWorkforce = create<WorkforceState>((set, get) => ({
  snapshot: null,
  loading: true,
  error: null,
  busy: null,
  selection: null,
  hoveredAgentId: null,
  activityOpen: true,

  async refresh() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`State request failed (${response.status})`);
      const snapshot = (await response.json()) as WorkforceSnapshot;
      set({ snapshot, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not reach the server.',
      });
    }
  },

  setBusy: (busy) => set({ busy }),
  select: (selection) => set({ selection }),
  hover: (hoveredAgentId) => set({ hoveredAgentId }),
  toggleActivity: () => set({ activityOpen: !get().activityOpen }),
}));

/* Convenience selectors — these return stable references only. */

export function useSnapshot() {
  return useWorkforce((s) => s.snapshot);
}

export function useAgents() {
  return useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
}

export function useAgent(id: string | null | undefined) {
  return useWorkforce((s) =>
    id ? (s.snapshot?.agents.find((a) => a.id === id) ?? null) : null,
  );
}

export function useMetrics() {
  return useWorkforce((s) => s.snapshot?.metrics ?? null);
}
