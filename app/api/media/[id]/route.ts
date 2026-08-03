import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { getMediaStorage } from '@/lib/media/storage';

export const dynamic = 'force-dynamic';

/**
 * Serves a stored media asset.
 *
 * Assets are never given a public URL by the local driver, so this is the only
 * way to reach one — and it checks ownership first, which is what makes a
 * rendered video shareable with the operator but nobody else.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { store, ownerId } = await getStore();

  const asset = await store.get('media_assets', id);
  if (!asset || asset.owner_id !== ownerId) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  }
  if (asset.status !== 'ready' || !asset.storage_path) {
    return NextResponse.json(
      { error: asset.error ?? 'This asset has no file behind it yet.' },
      { status: 409 },
    );
  }

  try {
    const data = await getMediaStorage().read(asset.storage_path);
    const download = new URL(request.url).searchParams.get('download') === '1';
    const filename = `${asset.type}-${asset.id.slice(0, 8)}.${asset.storage_path.split('.').pop()}`;
    const simulatedHeader: Record<string, string> = asset.simulated
      ? { 'X-Command-Centre-Simulated': 'true' }
      : {};

    // Video and audio need seeking to be watchable at all — a 12-minute
    // render served with no Range support forces a full download before the
    // first frame, and some browsers refuse to scrub it afterwards.
    const range = request.headers.get('range');
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : data.byteLength - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= data.byteLength) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${data.byteLength}` },
        });
      }
      const clampedEnd = Math.min(end, data.byteLength - 1);
      const chunk = data.subarray(start, clampedEnd + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          'Content-Type': asset.mime_type,
          'Content-Length': String(chunk.byteLength),
          'Content-Range': `bytes ${start}-${clampedEnd}/${data.byteLength}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
          ...simulatedHeader,
        },
      });
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': asset.mime_type,
        'Content-Length': String(data.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
        ...(download
          ? ({ 'Content-Disposition': `attachment; filename="${filename}"` } as Record<string, string>)
          : {}),
        // Makes it impossible to mistake a Demo placeholder for real media,
        // even when the file is opened outside the application.
        ...simulatedHeader,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The file could not be read.' },
      { status: 500 },
    );
  }
}
