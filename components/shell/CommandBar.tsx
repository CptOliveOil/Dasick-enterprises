'use client';

import { ArrowRight, Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Find me 10 promising YouTube video ideas',
  'Prepare a new faceless YouTube video',
  'Research digital products I could sell on Etsy',
  'Analyse why my last five videos performed badly',
  'Find keywords for a Ramadan printable pack',
];

/**
 * The command bar. Everything typed here goes to the Manager Agent, which
 * plans a real mission — never a canned reply.
 */
export function CommandBar({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useWorkforce((s) => s.busy);
  const setBusy = useWorkforce((s) => s.setBusy);
  const refresh = useWorkforce((s) => s.refresh);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = async (instruction: string) => {
    const trimmed = instruction.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy('Commanding workforce');
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The command failed.');
      setValue('');
      await refresh();
      if (data.mission) router.push('/command');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The command failed.');
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  return (
    <div className={cn('relative w-full max-w-2xl', className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(value);
        }}
        className={cn(
          'flex items-center gap-2.5 rounded-xl border bg-black/40 px-3.5 transition-colors',
          focused ? 'border-amber-500/40' : 'border-[var(--color-edge)]',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
        <input
          ref={input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          placeholder="Command your AI workforce…"
          aria-label="Command your AI workforce"
          disabled={Boolean(busy)}
          className="h-11 flex-1 bg-transparent text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!value.trim() || Boolean(busy)}
          aria-label="Send command"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/90 text-black transition-colors hover:bg-amber-400 disabled:bg-white/[0.06] disabled:text-[var(--color-ink-faint)]"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
        </button>
      </form>

      {focused && !value && (
        <div className="panel absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden p-1.5">
          <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
            Try
          </p>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setValue(suggestion);
                input.current?.focus();
              }}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--color-ink-muted)] hover:bg-white/[0.05] hover:text-[var(--color-ink)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="absolute inset-x-0 top-[calc(100%+6px)] z-40 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
