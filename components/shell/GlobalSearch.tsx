'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { inputClass } from '@/components/ui';
import type { SearchResult } from '@/app/api/search/route';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced so typing does not fan out a request per keystroke.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setResults(data.results ?? []);
      } catch {
        /* aborted or offline — leave the previous results in place */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search everything"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
        >
          <div
            className="panel w-full max-w-xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-3">
              <input
                ref={input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents, missions, tasks, ideas, scripts, products…"
                className={inputClass}
              />
            </div>
            <div className="scroll-thin max-h-[52vh] overflow-y-auto border-t border-[var(--color-edge-soft)]">
              {loading && (
                <p className="px-4 py-4 text-[13px] text-[var(--color-ink-faint)]">Searching…</p>
              )}
              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                  Nothing matched “{query}”.
                </p>
              )}
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 border-b border-[var(--color-edge-soft)] px-4 py-2.5 last:border-0 hover:bg-white/[0.04]"
                >
                  <span className="w-[68px] shrink-0 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    {result.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{result.title}</span>
                    <span className="block truncate text-[11px] text-[var(--color-ink-muted)]">
                      {result.subtitle}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
