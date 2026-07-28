'use client';

import dynamic from 'next/dynamic';
import { Maximize2, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { agentStatusStyle } from '@/lib/agents/status';
import { Button } from '@/components/ui';
import { HoverCard } from './HoverCard';
import { MobileGalaxy } from './MobileGalaxy';
import { detectQuality, prefersReducedMotion, type QualityProfile } from './quality';
import type { ViewCommand } from './GalaxyScene';

// WebGL is loaded only in the browser, and only once we know the device can use it.
const GalaxyScene = dynamic(() => import('./GalaxyScene').then((m) => m.GalaxyScene), {
  ssr: false,
  loading: () => <GalaxyLoading />,
});

function GalaxyLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="animate-breathe text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
        Initialising workforce
      </p>
    </div>
  );
}

function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
    );
  } catch {
    return false;
  }
}

export function Galaxy({ className }: { className?: string }) {
  const snapshot = useWorkforce((s) => s.snapshot);
  const selection = useWorkforce((s) => s.selection);
  const select = useWorkforce((s) => s.select);
  const hoveredAgentId = useWorkforce((s) => s.hoveredAgentId);
  const hover = useWorkforce((s) => s.hover);
  const busy = useWorkforce((s) => s.busy);

  const [quality, setQuality] = useState<QualityProfile | null>(null);
  const [animate, setAnimate] = useState(true);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [view, setView] = useState<ViewCommand>({ kind: 'none', nonce: 0 });
  const nonce = useRef(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuality(detectQuality());
    setAnimate(!prefersReducedMotion());
    setSupported(webglAvailable());
  }, []);

  // EMPTY rather than a fresh literal: these feed props and memo dependencies,
  // and a new array identity every render would re-run the whole scene.
  const agents = snapshot?.agents ?? EMPTY;
  const tasks = snapshot?.tasks ?? EMPTY;
  const connections = snapshot?.connections ?? EMPTY;

  const selectedAgentId = selection?.type === 'agent' ? selection.id : null;

  // Selecting a mission highlights only the planets involved in it.
  const highlightIds = useMemo(() => {
    if (selection?.type !== 'mission') return null;
    const ids = tasks
      .filter((t) => t.mission_id === selection.id && t.agent_id)
      .map((t) => t.agent_id!);
    return ids.length > 0 ? new Set(ids) : null;
  }, [selection, tasks]);

  const hoveredAgent = agents.find((a) => a.id === hoveredAgentId) ?? null;
  const hoveredTask =
    tasks.find(
      (t) =>
        t.agent_id === hoveredAgentId &&
        ['running', 'approval', 'queued'].includes(t.status),
    ) ?? null;
  const hoveredBusiness =
    snapshot?.businesses.find((b) => b.id === hoveredAgent?.business_id)?.name ?? null;

  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) {
        select(null);
        return;
      }
      select({ type: 'agent', id });
      nonce.current += 1;
      setView({ kind: 'focus', agentId: id, nonce: nonce.current });
    },
    [select],
  );

  useEffect(() => {
    if (selection?.type !== 'agent') return;
    nonce.current += 1;
    setView({ kind: 'focus', agentId: selection.id, nonce: nonce.current });
  }, [selection]);

  const command = (kind: ViewCommand['kind']) => {
    nonce.current += 1;
    setView({ kind, nonce: nonce.current });
  };

  return (
    <div
      ref={container}
      className={className}
      onPointerMove={(event) => {
        const bounds = container.current?.getBoundingClientRect();
        if (!bounds) return;
        setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      }}
    >
      <div className="relative h-full w-full">
        {/* Desktop: the real thing. */}
        <div className="absolute inset-0 hidden md:block">
          {supported === false ? (
            <GalaxyUnavailable />
          ) : quality && supported ? (
            <GalaxyScene
              agents={agents}
              tasks={tasks}
              connections={connections}
              quality={quality}
              animate={animate}
              selectedId={selectedAgentId}
              hoveredId={hoveredAgentId}
              highlightIds={highlightIds}
              coreActive={Boolean(busy)}
              view={view}
              onSelect={handleSelect}
              onHover={hover}
              onPositions={() => {}}
            />
          ) : (
            <GalaxyLoading />
          )}
        </div>

        {/* Small screens: a simplified, tappable system rather than a squeezed one. */}
        <div className="absolute inset-0 flex flex-col justify-center overflow-y-auto px-4 py-6 md:hidden">
          <MobileGalaxy
            agents={agents}
            tasks={tasks}
            selectedId={selectedAgentId}
            onSelect={(id) => select({ type: 'agent', id })}
          />
          <Legend className="mt-6" />
        </div>

        {hoveredAgent && (
          <div className="hidden md:block">
            <HoverCard
              agent={hoveredAgent}
              task={hoveredTask}
              business={hoveredBusiness}
              x={pointer.x}
              y={pointer.y}
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-end justify-between gap-4 p-4 md:flex">
          <Legend />
          <div className="pointer-events-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => command('reset')}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset view
            </Button>
            <Button size="sm" variant="secondary" onClick={() => command('fit')}>
              <Maximize2 className="h-3.5 w-3.5" />
              Fit all agents
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalaxyUnavailable() {
  const agents = useWorkforce((s) => s.snapshot?.agents) ?? EMPTY;
  const select = useWorkforce((s) => s.select);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Sparkles className="h-6 w-6 text-[var(--color-ink-faint)]" />
      <div>
        <p className="text-sm font-medium">This browser cannot render the galaxy</p>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--color-ink-muted)]">
          WebGL is unavailable. Every agent is still fully usable from the list below and
          from the Agents area.
        </p>
      </div>
      <div className="grid max-h-[40vh] w-full max-w-2xl grid-cols-2 gap-2 overflow-y-auto">
        {agents.map((agent) => {
          const style = agentStatusStyle(agent.status);
          return (
            <button
              key={agent.id}
              onClick={() => select({ type: 'agent', id: agent.id })}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3 py-2 text-left text-[13px] hover:bg-white/[0.07]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: agent.visual.colour }}
              />
              <span className="truncate">{agent.name}</span>
              <span className={`ml-auto text-[11px] ${style.text}`}>{style.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LEGEND: { label: string; colour: string }[] = [
  { label: 'Working', colour: '#38bdf8' },
  { label: 'Idle', colour: '#34d399' },
  { label: 'Needs approval', colour: '#f59e0b' },
  { label: 'Error', colour: '#f87171' },
  { label: 'Offline', colour: '#475569' },
];

function Legend({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-ink-faint)] ${className ?? ''}`}
    >
      {LEGEND.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: item.colour, boxShadow: `0 0 6px ${item.colour}` }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
