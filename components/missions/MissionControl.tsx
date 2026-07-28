'use client';

import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { MISSION_STATUS_STYLES } from '@/lib/agents/status';
import { missionLabel } from '@/lib/utils';
import { ProgressBar } from '@/components/ui';

/**
 * Floating mission control. Clicking a mission highlights exactly the planets
 * working on it and swaps the contextual panel to the mission inspector.
 */
export function MissionControl({ className }: { className?: string }) {
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;
  const selection = useWorkforce((s) => s.selection);
  const select = useWorkforce((s) => s.select);

  const active = missions
    .filter((m) => !['completed', 'cancelled', 'failed'].includes(m.status))
    .slice(0, 4);

  if (active.length === 0) return null;

  return (
    <div className={`panel w-[268px] overflow-hidden ${className ?? ''}`}>
      <p className="border-b border-[var(--color-edge-soft)] px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
        Active missions
      </p>
      <ul className="p-1.5">
        {active.map((mission) => {
          const style = MISSION_STATUS_STYLES[mission.status];
          const selected = selection?.type === 'mission' && selection.id === mission.id;
          return (
            <li key={mission.id}>
              <button
                onClick={() =>
                  select(selected ? null : { type: 'mission', id: mission.id })
                }
                aria-pressed={selected}
                className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${
                  selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                }`}
              >
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-amber-400">
                    {missionLabel(mission.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{mission.title}</span>
                  <span className="text-[11px] text-[var(--color-ink-faint)]">
                    {mission.progress}%
                  </span>
                </p>
                <p className={`mt-0.5 text-[11px] ${style.text}`}>{style.label}</p>
                <ProgressBar className="mt-1.5" value={mission.progress} label="Mission progress" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
