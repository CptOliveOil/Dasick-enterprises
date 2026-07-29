'use client';

import { ChevronDown } from 'lucide-react';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';

/**
 * Which business the interface is looking at.
 *
 * Purely a *view* filter: it changes what the galaxy, queue, missions and
 * activity show, and nothing else. It does not scope what agents can see, which
 * is decided by business assignment and memory access on the server — a UI
 * filter is not a boundary.
 *
 * "All businesses" returns to the whole universe.
 */
export function BusinessSwitcher({ className }: { className?: string }) {
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;
  const filter = useWorkforce((s) => s.businessFilter);
  const setFilter = useWorkforce((s) => s.setBusinessFilter);

  if (businesses.length < 2) return null;

  const active = businesses.find((business) => business.id === filter) ?? null;

  return (
    <label className={`relative flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="sr-only">Business</span>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full transition-colors"
        style={{
          backgroundColor: active?.colour ?? '#94a3b8',
          boxShadow: active ? `0 0 7px ${active.colour}` : undefined,
        }}
      />
      <select
        value={filter ?? ''}
        onChange={(event) => setFilter(event.target.value || null)}
        className="appearance-none rounded-lg border border-[var(--color-edge)] bg-white/[0.03] py-1 pl-2 pr-6 text-[12px] text-[var(--color-ink)] outline-none transition-colors hover:bg-white/[0.06] focus:border-amber-400/50"
      >
        <option value="">All businesses</option>
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-[var(--color-ink-faint)]"
      />
    </label>
  );
}
