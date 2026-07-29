'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { BusinessKind } from '@/types/domain';

interface Option {
  id: string;
  name: string;
  colour: string;
}

/**
 * Picks which channel a workspace is showing.
 *
 * Only rendered when an account genuinely has more than one business of a kind
 * — a single-channel workspace should not grow a control that does nothing.
 */
export function WorkspaceSwitcher({
  kind,
  current,
  options,
}: {
  kind: BusinessKind;
  current: string;
  options: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (options.length < 2) return null;

  const change = async (businessId: string) => {
    if (businessId === current) return;
    setBusy(true);
    try {
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, business_id: businessId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const active = options.find((option) => option.id === current);

  return (
    <label className="relative flex items-center gap-2">
      <span className="sr-only">Channel</span>
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: active?.colour ?? '#94a3b8' }}
      />
      <select
        value={current}
        disabled={busy}
        onChange={(event) => change(event.target.value)}
        className="appearance-none rounded-lg border border-[var(--color-edge)] bg-white/[0.03] py-1.5 pl-2.5 pr-7 text-[12px] text-[var(--color-ink)] outline-none transition-colors hover:bg-white/[0.06] focus:border-amber-400/50"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[var(--color-ink-faint)]"
      />
    </label>
  );
}
