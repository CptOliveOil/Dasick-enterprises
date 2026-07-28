'use client';

import { useEffect } from 'react';
import { useWorkforce } from './workforce';

/** How often the interface re-reads workforce state while the tab is visible. */
const POLL_MS = 4000;

/**
 * Keeps the snapshot fresh. Polling rather than sockets: it works identically
 * on the in-memory store and on Supabase, survives serverless cold starts, and
 * stops entirely when the tab is hidden.
 */
export function LiveStateProvider({ children }: { children: React.ReactNode }) {
  const refresh = useWorkforce((s) => s.refresh);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        await refresh();
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return <>{children}</>;
}
