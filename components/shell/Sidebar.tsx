'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Command } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkforce } from '@/lib/store/workforce';
import { MOBILE_NAVIGATION, NAVIGATION, type NavItem } from './navigation';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const pending = useWorkforce((s) => s.snapshot?.metrics.awaitingApproval ?? 0);

  const sections = NAVIGATION.reduce<Record<string, NavItem[]>>((acc, item) => {
    const key = item.section ?? '';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <nav
      aria-label="Primary"
      className="hidden w-[212px] shrink-0 flex-col gap-1 border-r border-[var(--color-edge)] bg-[var(--color-deep)]/60 px-3 py-3 md:flex"
    >
      {Object.entries(sections).map(([section, items]) => (
        <div key={section} className="mb-1">
          {section && (
            <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
              {section}
            </p>
          )}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const badge = item.badge === 'approvals' ? pending : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                      active
                        ? 'bg-white/[0.07] text-[var(--color-ink)]'
                        : 'text-[var(--color-ink-muted)] hover:bg-white/[0.04] hover:text-[var(--color-ink)]',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-amber-400' : 'text-[var(--color-ink-faint)]',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="ml-auto rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto">
        <Link
          href="/command"
          className="flex items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3 py-2.5 text-[13px] text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-ink)]"
        >
          <Command className="h-4 w-4 text-amber-400" />
          AI Command
          <kbd className="ml-auto rounded border border-[var(--color-edge)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-faint)]">
            ⌘K
          </kbd>
        </Link>
      </div>
    </nav>
  );
}

/** Bottom bar on small screens. Approvals stay one tap away. */
export function MobileNav() {
  const pathname = usePathname();
  const pending = useWorkforce((s) => s.snapshot?.metrics.awaitingApproval ?? 0);

  return (
    <nav
      aria-label="Primary"
      className="panel-flush fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around rounded-none border-x-0 border-b-0 px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_NAVIGATION.map((item) => {
        const active = isActive(pathname, item.href);
        const badge = item.badge === 'approvals' ? pending : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]',
              active ? 'text-amber-400' : 'text-[var(--color-ink-faint)]',
            )}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
            {badge > 0 && (
              <span className="absolute right-[18%] top-1.5 min-w-[15px] rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
