import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  business_id: z.string().uuid().optional(),
  store_id: z.string().uuid().nullable().optional(),
  niche: z.string().min(2).max(200),
  count: z.number().int().min(1).max(15).default(6),
  instructions: z.string().max(1000).default(''),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Tell the researcher which niche to work in.' },
      { status: 400 },
    );
  }

  const { store, ownerId } = await getStore();
  const businesses = await store.list('businesses', { where: { owner_id: ownerId } });
  const business =
    businesses.find((b) => b.id === parsed.data.business_id) ??
    businesses.find((b) => b.kind === 'etsy') ??
    null;

  if (!business) {
    return NextResponse.json(
      { error: 'No Etsy business exists yet. Create one in Settings → Businesses.' },
      { status: 409 },
    );
  }

  try {
    const { mission } = await createMission(store, {
      ownerId,
      businessId: business.id,
      title: `Find ${parsed.data.count} product opportunities`,
      objective: `Research ${parsed.data.count} digital product opportunities in ${parsed.data.niche}.`,
      steps: [
        {
          capability: 'etsy.research.opportunities',
          title: `Research ${parsed.data.count} product opportunities`,
          description: parsed.data.instructions,
        },
      ],
      context: { niche: parsed.data.niche },
      seedInput: {
        count: parsed.data.count,
        niche: parsed.data.niche,
        instructions: parsed.data.instructions,
        store_id: parsed.data.store_id ?? null,
      },
    });

    const run = await runMission(store, ownerId, mission.id);
    const opportunities = await store.list('etsy_opportunities', {
      where: { mission_id: mission.id },
      orderBy: { column: 'score', ascending: false },
    });

    return NextResponse.json({ mission, run, opportunities });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research failed.' },
      { status: 500 },
    );
  }
}
