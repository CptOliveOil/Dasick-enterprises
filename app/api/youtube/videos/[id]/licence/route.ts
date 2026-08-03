import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth/session';
import { buildLicenceReport, licenceReportMarkdown } from '@/lib/production/licence-report';

export const dynamic = 'force-dynamic';

/**
 * The licence report for one video.
 *
 * `?format=markdown` downloads it; the default returns JSON for the review
 * screen. Owner-scoped through the same permission gate as everything else, and
 * it carries no provider credentials — only what was recorded about each asset.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withPermission('businesses.view', async ({ store, ownerId }) => {
    const video = await store.get('youtube_videos', id).catch(() => null);
    if (!video) return NextResponse.json({ error: 'No such video.' }, { status: 404 });

    const business = await store.get('businesses', video.business_id).catch(() => null);
    if (!business || business.owner_id !== ownerId) {
      return NextResponse.json({ error: 'No such video.' }, { status: 404 });
    }

    try {
      const report = await buildLicenceReport(store, video);
      if (new URL(request.url).searchParams.get('format') === 'markdown') {
        return new NextResponse(licenceReportMarkdown(report), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="licence-report-${id.slice(0, 8)}.md"`,
          },
        });
      }
      return NextResponse.json({ report });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Could not build the licence report.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  });
}
