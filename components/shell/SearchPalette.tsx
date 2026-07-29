'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { inputClass } from '@/components/ui';

interface Result {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Cmd/Ctrl+K, everywhere.
 *
 * Results come from `/api/search`, which is scoped to the signed-in account —
 * the palette is a view onto that, not a second source of truth. Selecting a
 * result navigates; nothing here runs a command.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      // Esc closes the palette; when it is shut, other components handle Esc.
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(0);
      // Focus after paint, or the input is not in the document yet.
      requestAnimationFrame(() => input.current?.focus());
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        // Aborted or offline — leave the previous results in place.
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  if (!open) return null;

  const go = (result: Result) => {
    setOpen(false);
    router.push(result.href);
  };

  // Grouped by type, in the order the API returned them.
  const groups = results.reduce<Record<string, Result[]>>((acc, result) => {
    (acc[result.type] ??= []).push(result);
    return acc;
  }, {});

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="panel w-full max-w-[560px] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-edge-soft)] px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (event.key === 'Enter' && results[active]) {
                event.preventDefault();
                go(results[active]!);
              }
            }}
            placeholder="Search agents, missions, videos, approvals…"
            className={`${inputClass} border-0 bg-transparent px-0 focus:ring-0`}
            aria-label="Search"
          />
        </div>

        <div className="scroll-thin max-h-[52vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-3.5 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">
              Type at least two characters.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">
              Nothing matches “{query}”.
            </p>
          ) : (
            Object.entries(groups).map(([type, rows]) => (
              <div key={type}>
                <p className="px-3.5 pb-1 pt-2.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                  {type}
                </p>
                {rows.map((result) => {
                  const index = results.indexOf(result);
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(result)}
                      className={`block w-full px-3.5 py-2 text-left transition-colors ${
                        index === active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="block truncate text-[13px]">{result.title}</span>
                      <span className="block truncate text-[11px] text-[var(--color-ink-faint)]">
                        {result.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <p className="border-t border-[var(--color-edge-soft)] px-3.5 py-1.5 text-[10px] text-[var(--color-ink-faint)]">
          ↑↓ to move · ↵ to open · esc to close
        </p>
      </div>
    </div>
  );
}
