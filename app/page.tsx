'use client';

import { Galaxy } from '@/components/galaxy/Galaxy';
import { MissionControl } from '@/components/missions/MissionControl';
import { ActivityStream } from '@/components/shell/ActivityStream';
import { MetricsStrip } from '@/components/shell/MetricsStrip';
import { RightPanel } from '@/components/shell/RightPanel';
import { useWorkforce } from '@/lib/store/workforce';
import { AgentInspector } from '@/components/agents/AgentInspector';
import { MissionInspector } from '@/components/missions/MissionInspector';

/**
 * The universe. The galaxy is the primary interface; the strip above it and the
 * panel beside it exist to answer "what is happening and what needs me".
 */
export default function UniversePage() {
  const selection = useWorkforce((s) => s.selection);
  const select = useWorkforce((s) => s.select);
  const snapshot = useWorkforce((s) => s.snapshot);
  const error = useWorkforce((s) => s.error);

  const agent =
    selection?.type === 'agent'
      ? (snapshot?.agents.find((a) => a.id === selection.id) ?? null)
      : null;
  const mission =
    selection?.type === 'mission'
      ? (snapshot?.missions.find((m) => m.id === selection.id) ?? null)
      : null;

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <MetricsStrip />

        {error && (
          <p className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-300">
            {error} — retrying automatically.
          </p>
        )}

        <div className="relative min-h-0 flex-1">
          <Galaxy className="absolute inset-0" />
          <MissionControl className="pointer-events-auto absolute left-4 top-4 hidden md:block" />
        </div>

        <ActivityStream />
      </section>

      <RightPanel />

      {/* Below the right panel's breakpoint the inspector becomes a sheet. */}
      {(agent || mission) && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col bg-[var(--color-void)]/95 backdrop-blur-xl lg:hidden">
          <div className="min-h-0 flex-1 overflow-hidden pb-14">
            {agent ? (
              <AgentInspector agent={agent} onClose={() => select(null)} />
            ) : mission ? (
              <MissionInspector mission={mission} onClose={() => select(null)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
