'use client';

import { AlertTriangle, Check, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StageView } from '@/lib/production/summary';

const STATE_STYLES = {
  done: { icon: Check, colour: 'text-emerald-300', ring: 'border-emerald-400/40 bg-emerald-400/10' },
  active: { icon: Loader2, colour: 'text-sky-300', ring: 'border-sky-400/50 bg-sky-400/10' },
  blocked: { icon: AlertTriangle, colour: 'text-amber-300', ring: 'border-amber-400/50 bg-amber-400/10' },
  pending: { icon: Circle, colour: 'text-[var(--color-ink-faint)]', ring: 'border-[var(--color-edge)]' },
  skipped: { icon: Circle, colour: 'text-[var(--color-ink-faint)]', ring: 'border-[var(--color-edge)]' },
} as const;

/**
 * The production chain for one video.
 *
 * Every stage's state comes from real records — a tick means the work exists,
 * not that a counter was incremented.
 */
export function PipelineTrack({
  stages,
  onSelect,
  selected,
}: {
  stages: StageView[];
  onSelect?: (stage: StageView) => void;
  selected?: string | null;
}) {
  return (
    <ol className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
      {stages.map((stage) => {
        const style = STATE_STYLES[stage.state];
        const Icon = style.icon;
        const isSelected = selected === stage.stage;
        return (
          <li key={stage.stage} className="shrink-0">
            <button
              onClick={() => onSelect?.(stage)}
              disabled={!onSelect}
              aria-current={isSelected ? 'step' : undefined}
              className={cn(
                'flex w-[128px] flex-col gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
                style.ring,
                onSelect && 'hover:bg-white/[0.06]',
                isSelected && 'ring-1 ring-white/25',
              )}
            >
              <span className={cn('flex items-center gap-1.5', style.colour)}>
                <Icon
                  className={cn('h-3.5 w-3.5 shrink-0', stage.state === 'active' && 'animate-spin')}
                />
                <span className="truncate text-[11px] font-medium">{stage.label}</span>
              </span>
              <span className="block min-h-[14px] truncate text-[10px] text-[var(--color-ink-faint)]">
                {stage.detail}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
