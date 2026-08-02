import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth/session';
import { buildUploadPackage } from '@/lib/production/upload-package';

export const dynamic = 'force-dynamic';

/**
 * Everything that ships with a video, assembled from stored records.
 *
 * Read-only and free. `?format=markdown` returns the whole package as one
 * downloadable document; the default returns it structured, for the final
 * approval screen.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withPermission('businesses.view', async ({ store }) => {
    const video = await store.get('youtube_videos', id).catch(() => null);
    if (!video) return NextResponse.json({ error: 'No such video.' }, { status: 404 });

    try {
      const uploadPackage = await buildUploadPackage(store, video);
      if (new URL(request.url).searchParams.get('format') === 'markdown') {
        return new NextResponse(uploadPackage.markdown, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="upload-package-${id.slice(0, 8)}.md"`,
          },
        });
      }
      return NextResponse.json({ package: uploadPackage });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Could not assemble the upload package.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  });
}
