'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel', className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[var(--color-edge-soft)] px-4 py-3',
        className,
      )}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-amber-500/90 text-black hover:bg-amber-400 disabled:bg-amber-500/40 disabled:text-black/60',
  secondary:
    'bg-white/[0.06] text-[var(--color-ink)] hover:bg-white/[0.11] border border-[var(--color-edge)]',
  ghost: 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-white/[0.05]',
  danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/25',
  success:
    'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/25',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = 'secondary', size = 'md', loading, children, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-60',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-[13px]',
          BUTTON_VARIANTS[variant],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {children}
      </button>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Status primitives                                                   */
/* ------------------------------------------------------------------ */

export function StatusDot({
  colour,
  pulse,
  className,
}: {
  colour: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      <span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: colour, boxShadow: `0 0 8px ${colour}` }}
      />
      {pulse && (
        <span
          className="animate-pulse-ring absolute inset-0 rounded-full"
          style={{ backgroundColor: colour }}
        />
      )}
    </span>
  );
}

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'amber' | 'sky' | 'emerald' | 'red';
}) {
  const tones = {
    neutral: 'bg-white/[0.06] text-[var(--color-ink-muted)]',
    amber: 'bg-amber-400/10 text-amber-300',
    sky: 'bg-sky-400/10 text-sky-300',
    emerald: 'bg-emerald-400/10 text-emerald-300',
    red: 'bg-red-400/10 text-red-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  colour = '#38bdf8',
  className,
  label,
}: {
  value: number;
  colour?: string;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped}%`, backgroundColor: colour }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function Metric({
  value,
  label,
  tone,
  className,
}: {
  value: React.ReactNode;
  label: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div
        className="truncate text-[22px] font-semibold leading-tight tracking-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  icon,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-[var(--color-ink-faint)]">{icon}</div>}
      <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
      {detail && (
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          {detail}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Draws a compact trend line. Purely decorative — never the only readout. */
export function Sparkline({
  points,
  colour = '#34d399',
  height = 34,
  className,
}: {
  points: number[];
  colour?: string;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return <div style={{ height }} className={className} />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const width = 100;
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height, width: '100%' }}
      aria-hidden
    >
      <path d={path} fill="none" stroke={colour} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-[var(--color-edge)] bg-black/30 px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-sky-500/50 focus:outline-none';

export function DemoNotice({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300',
        className,
      )}
      title="This record is seeded demo data, not real activity."
    >
      Demo
    </span>
  );
}
