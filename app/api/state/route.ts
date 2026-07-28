import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { buildSnapshot } from '@/lib/state/snapshot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { store, ownerId, isDemo } = await getStore();
  const snapshot = await buildSnapshot(store, ownerId, isDemo);
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
