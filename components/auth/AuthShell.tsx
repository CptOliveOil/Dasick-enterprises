import Link from 'next/link';
import type { ReactNode } from 'react';
import { Panel } from '@/components/ui';

/**
 * The frame shared by sign-in, forgot-password and reset-password.
 *
 * Deliberately *not* the real galaxy: React Three Fiber, the texture cache and
 * the WebGL context are a lot to pay for a page whose job is to accept two
 * fields, and it is the one page every device hits first. This is the same
 * starfield gradient the rest of the app uses, plus a handful of CSS stars —
 * no canvas, no JavaScript, and it costs nothing on a phone.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="starfield relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <Stars />
      <div className="relative w-full max-w-[380px]">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="relative flex h-7 w-7 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-400/25 blur-[8px]" />
            <span className="relative h-3.5 w-3.5 rounded-full bg-amber-400" />
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em]">
            Command Centre
          </span>
        </Link>

        <Panel className="p-6">
          <h1 className="text-[16px] font-semibold">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              {subtitle}
            </p>
          )}
          <div className="mt-5">{children}</div>
        </Panel>

        {footer && (
          <div className="mt-4 text-center text-[12px] text-[var(--color-ink-faint)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A dozen static stars. Positions are fixed so there is no layout jitter. */
const STARS = [
  [12, 18, 1.5, 0.5],
  [24, 62, 1, 0.35],
  [31, 8, 1, 0.4],
  [44, 84, 1.5, 0.45],
  [58, 26, 1, 0.3],
  [67, 71, 2, 0.5],
  [73, 14, 1, 0.35],
  [81, 46, 1.5, 0.4],
  [88, 79, 1, 0.3],
  [92, 22, 1.5, 0.45],
  [7, 45, 1, 0.3],
  [52, 52, 1, 0.25],
] as const;

function Stars() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {STARS.map(([left, top, size, opacity], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: size,
            height: size,
            opacity,
          }}
        />
      ))}
    </div>
  );
}
