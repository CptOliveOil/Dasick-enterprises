'use client';

import { useMemo } from 'react';
import { agentStatusStyle } from '@/lib/agents/status';
import type { Agent, Task } from '@/types/domain';

/**
 * Simplified solar system for small screens.
 *
 * Deliberately not the desktop galaxy scaled down: a single SVG, no WebGL, no
 * orbital animation, large tap targets. Status still comes from real agent
 * state, so the same information is available.
 */
export function MobileGalaxy({
  agents,
  tasks,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => {
    // Two concentric rings keep every planet reachable without panning.
    const inner = agents.slice(0, Math.ceil(agents.length / 2));
    const outer = agents.slice(Math.ceil(agents.length / 2));
    const place = (list: Agent[], radius: number, offset: number) =>
      list.map((agent, i) => {
        const angle = (i / Math.max(1, list.length)) * Math.PI * 2 + offset;
        return {
          agent,
          x: 160 + Math.cos(angle) * radius,
          y: 160 + Math.sin(angle) * radius,
        };
      });
    return [...place(inner, 68, -Math.PI / 2), ...place(outer, 122, -Math.PI / 2 + 0.4)];
  }, [agents]);

  const activeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.agent_id) continue;
      if (!['running', 'queued', 'approval'].includes(task.status)) continue;
      counts.set(task.agent_id, (counts.get(task.agent_id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 320 320" className="mx-auto block w-full max-w-[380px]" role="group" aria-label="AI workforce">
        <defs>
          <radialGradient id="core-glow">
            <stop offset="0%" stopColor="#ffd08a" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#f5a524" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f5a524" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={160} cy={160} r={68} fill="none" stroke="#1f2942" strokeWidth={1} />
        <circle cx={160} cy={160} r={122} fill="none" stroke="#1f2942" strokeWidth={1} />
        <circle cx={160} cy={160} r={46} fill="url(#core-glow)" />
        <circle cx={160} cy={160} r={13} fill="#ffcf7a" />

        {layout.map(({ agent, x, y }) => {
          const style = agentStatusStyle(agent.status);
          const selected = selectedId === agent.id;
          const count = activeCounts.get(agent.id) ?? 0;
          return (
            <g
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${agent.name} — ${style.label}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(agent.id);
                }
              }}
            >
              {/* Oversized transparent hit area — fingers are not cursors. */}
              <circle cx={x} cy={y} r={22} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={15}
                fill={agent.visual.colour}
                opacity={style.dim ? 0.3 : 0.22}
              />
              <circle
                cx={x}
                cy={y}
                r={10}
                fill={agent.visual.colour}
                opacity={style.dim ? 0.45 : 1}
                stroke={selected ? '#e8ebf5' : style.colour}
                strokeWidth={selected ? 2 : 1}
              />
              {agent.status === 'needs_approval' && (
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  opacity={0.85}
                />
              )}
              {count > 0 && (
                <>
                  <circle cx={x + 12} cy={y - 12} r={7} fill="#0b1020" stroke="#38bdf8" strokeWidth={1} />
                  <text
                    x={x + 12}
                    y={y - 9}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#7dd3fc"
                    fontWeight={600}
                  >
                    {count}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
