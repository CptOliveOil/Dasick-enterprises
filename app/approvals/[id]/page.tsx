'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { DossierView } from '@/components/approvals/dossier/DossierView';

/**
 * One approval, given the whole screen.
 *
 * The review is complete here — the script, the claims, the sources, the
 * scores, the storyboard and the history are all on this page, which is the
 * point. "Open another page to read the thing you are approving" is how an
 * operator ends up approving a summary.
 */
export default function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const refresh = useWorkforce((s) => s.refresh);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-8">
      <Link
        href="/approvals"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] print:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All approvals
      </Link>

      <DossierView approvalId={id} onResolved={refresh} />
    </div>
  );
}
