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

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': asset.mime_type,
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'private, max-age=3600',
        ...(download ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
        // Makes it impossible to mistake a Demo placeholder for real media,
        // even when the file is opened outside the application.
        ...(asset.simulated ? { 'X-Command-Centre-Simulated': 'true' } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The file could not be read.' },
      { status: 500 },
    );
  }
}
