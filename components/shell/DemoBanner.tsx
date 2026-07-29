'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { isPubliclyExposedDemo } from '@/lib/operations/deployment';

/**
 * The banner for a deployment that has no authentication.
 *
 * Deliberately not dismissible. A public workspace is a live problem for as
 * long as it is public, and a banner you can close is one you close once and
 * never think about again.
 */
export function DemoBanner() {
  const demo = useWorkforce((s) => s.snapshot?.demo ?? false);
  const [hostname, setHostname] = useState<string | undefined>(undefined);

  useEffect(() => setHostname(window.location.hostname), []);

  // Wait for the hostname before deciding; rendering on the server would flash
  // the banner on localhost.
  if (hostname === undefined) return null;
  if (!isPubliclyExposedDemo({ demo, nodeEnv: process.env.NODE_ENV, hostname })) return null;

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-red-500/40 bg-red-500/15 px-4 py-2 text-[12px] text-red-100"
    >
      <ShieldAlert aria-hidden className="h-4 w-4 shrink-0" />
      <strong className="font-semibold uppercase tracking-[0.08em]">
        Demo instance — not private
      </strong>
      <span className="text-red-100/80">
        Authentication is not configured. Anyone with this URL can read this workspace.
      </span>
      <Link
        href="/settings/security"
        className="underline underline-offset-4 hover:text-white"
      >
        Configure Supabase to secure it
      </Link>
    </div>
  );
}
