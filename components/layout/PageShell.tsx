'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Conventional workspace chrome for every non-galaxy route. The galaxy is the
 * primary experience; these pages are the productivity and accessibility route
 * to exactly the same data.
 */
export function PageShell({
  title,
  description,
  actions,
  tabs,
  children,
  wide,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: { href: string; label: string }[];
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-5 md:px-6', wide ? 'max-w-[1500px]' : 'max-w-6xl')}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>

      {tabs && <Tabs tabs={tabs} />}

      {children}
    </div>
  );
}

export function Tabs({
  tabs,
  onSelect,
  active: activeHref,
}: {
  tabs: { href: string; label: string }[];
  /** When given, tabs switch in place rather than navigating. */
  onSelect?: (href: string) => void;
  active?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className="scroll-thin mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-edge)] pb-px">
      {tabs.map((tab) => {
        const active = activeHref ? activeHref === tab.href : pathname === tab.href;
        if (onSelect) {
          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => onSelect(tab.href)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors',
                active
                  ? 'border-amber-400 text-[var(--color-ink)]'
                  : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              {tab.label}
            </button>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors',
              active
                ? 'border-amber-400 text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-6', className)}>
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Simple, keyboard-navigable table. Kept plain on purpose. */
export function DataTable<T>({
  rows,
  columns,
  empty,
  onRowClick,
  rowKey,
}: {
  rows: T[];
  columns: { key: string; header: string; className?: string; render: (row: T) => React.ReactNode }[];
  empty: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel px-4 py-10 text-center text-[13px] text-[var(--color-ink-muted)]">
        {empty}
      </div>
    );
  }
  return (
    <div className="panel overflow-hidden">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-[var(--color-edge-soft)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-[var(--color-edge-soft)] last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-white/[0.035]',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3.5 py-2.5 align-top text-[13px]', column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Horizontal 0–100 score bar with the number beside it. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const colour = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: colour }}
        />
      </span>
      <span className="tabular-nums text-[12px]" style={{ color: colour }}>
        {score}
      </span>
    </span>
  );
}
