'use client';

import Link from 'next/link';
import { Bell, CircleUser } from 'lucide-react';
import { useState } from 'react';
import { useWorkforce } from '@/lib/store/workforce';
import { formatRelativeTime } from '@/lib/utils';
import { CommandBar } from './CommandBar';
import { GlobalSearch } from './GlobalSearch';

export function TopBar() {
  const notifications = useWorkforce((s) => s.snapshot?.notifications ?? []);
  const demo = useWorkforce((s) => s.snapshot?.demo ?? false);
  const aiLive = useWorkforce((s) => s.snapshot?.aiLive ?? false);
  const [showNotifications, setShowNotifications] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-edge)] bg-[var(--color-deep)]/70 px-3 backdrop-blur-xl md:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-amber-400/25 blur-[6px]" />
          <span className="relative h-3 w-3 rounded-full bg-amber-400" />
        </span>
        <span className="hidden text-[13px] font-semibold uppercase tracking-[0.16em] sm:block">
          Command Centre
        </span>
      </Link>

      <div className="flex flex-1 justify-center px-1">
        <CommandBar />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {demo && (
          <span
            className="hidden rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300 lg:block"
            title="No database is configured, so this session runs on seeded demo data."
          >
            Demo data
          </span>
        )}
        {!aiLive && (
          <span
            className="hidden rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)] lg:block"
            title="No AI provider is configured. Agents run on the simulated provider and their output is labelled."
          >
            AI simulated
          </span>
        )}

        <GlobalSearch />

        <div className="relative">
          <button
            onClick={() => setShowNotifications((open) => !open)}
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
            aria-expanded={showNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                {unread}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="panel absolute right-0 top-[calc(100%+6px)] z-40 w-[320px] overflow-hidden">
              <p className="border-b border-[var(--color-edge-soft)] px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                Notifications
              </p>
              <div className="scroll-thin max-h-[340px] overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="px-3.5 py-6 text-center text-[13px] text-[var(--color-ink-faint)]">
                    Nothing yet.
                  </p>
                )}
                {notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={notification.href ?? '#'}
                    onClick={() => setShowNotifications(false)}
                    className="block border-b border-[var(--color-edge-soft)] px-3.5 py-2.5 last:border-0 hover:bg-white/[0.04]"
                  >
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      {!notification.read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      )}
                      {notification.title}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                      {notification.body}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <Link
          href="/settings"
          aria-label="Settings and profile"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
        >
          <CircleUser className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}
