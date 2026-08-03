'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { DossierView } from '@/components/approvals/dossier/DossierView';

/**
 * The studio review for one finished video.
 *
 * It is the dossier — same registry, same panels, same decision bar as every
 * other approval — with the downloads a publishing decision needs bolted
 * alongside. Building a separate screen would have meant a second place for
 * "what does approving do" to drift out of step with the first.
 *
 * The route takes the *approval* id rather than the video id, because the
 * decision is the thing being made and the approval is what carries its
 * consequences, its history and its permission checks.
 */
export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const refresh = useWorkforce((s) => s.refresh);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The downloads hang off the video, and only the approval id is in the URL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/approvals/${id}/dossier`);
        const body = await response.json().catch(() => ({}));
        const href: string | undefined = body?.dossier?.href;
        const match = href?.match(/\/youtube\/production\/([0-9a-f-]{36})/i);
        if (!cancelled) setVideoId(match?.[1] ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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

      <section className="mt-6 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-panel)]/40 p-5 print:hidden">
        <h3 className="text-[15px] font-semibold">Take it with you</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
          Everything that ships with the video, assembled from what is stored. A section with no
          record says so rather than being left out.
        </p>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Finding the downloads…
          </p>
        ) : videoId ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <DownloadLink href={`/api/youtube/videos/${videoId}/package?format=markdown`}>
              <FileText className="h-3.5 w-3.5" />
              Upload package
            </DownloadLink>
            <DownloadLink href={`/api/youtube/videos/${videoId}/licence?format=markdown`}>
              <FileText className="h-3.5 w-3.5" />
              Licence report
            </DownloadLink>
            <DownloadLink href={`/api/youtube/videos/${videoId}/package`}>
              <Download className="h-3.5 w-3.5" />
              Package as JSON
            </DownloadLink>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
            This approval is not attached to a video, so there is nothing to download.
          </p>
        )}
      </section>
    </div>
  );
}

function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-edge)] px-3 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-ink)]"
    >
      {children}
    </a>
  );
}
