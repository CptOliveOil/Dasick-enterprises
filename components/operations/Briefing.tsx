'use client';

import type { DailyBriefing } from '@/schemas/manager-ops';

/**
 * A briefing, rendered.
 *
 * Every section is omitted when empty. An empty list is a correct answer — the
 * Manager is told to leave one empty rather than reach for something to fill
 * it — and rendering an empty heading would undo that.
 */
export function Briefing({ briefing }: { briefing: DailyBriefing }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed">{briefing.summary}</p>

      <Section title="Needs attention" items={briefing.things_needing_attention} tone="amber" />
      <Section
        title="At risk"
        items={briefing.missions_at_risk.map((item) => `${item.mission} — ${item.why}`)}
        tone="red"
      />
      <Section title="Updates" items={briefing.important_updates} />
      <Section title="Wins" items={briefing.recent_wins} tone="emerald" />
      <Section title="Costs" items={briefing.cost_notes} />
      <Section title="Next" items={briefing.recommended_next_actions} ordered />
    </div>
  );
}

function Section({
  title,
  items,
  tone,
  ordered,
}: {
  title: string;
  items: string[];
  tone?: 'amber' | 'red' | 'emerald';
  ordered?: boolean;
}) {
  if (items.length === 0) return null;
  const colour =
    tone === 'amber'
      ? 'text-amber-300'
      : tone === 'red'
        ? 'text-red-300'
        : tone === 'emerald'
          ? 'text-emerald-300'
          : 'text-[var(--color-ink-faint)]';

  const List = ordered ? 'ol' : 'ul';
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-[0.1em] ${colour}`}>{title}</p>
      <List className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex gap-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]"
          >
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </List>
    </div>
  );
}
