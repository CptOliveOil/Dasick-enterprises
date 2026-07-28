import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { createMission } from '@/lib/workflows/engine';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  business_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().nullable().optional(),
  niche: z.string().min(2).max(200),
  count: z.number().int().min(1).max(20).default(10),
  audience: z.string().max(300).default(''),
  instructions: z.string().max(1000).default(''),
});

/**
 * The YouTube Idea Generator — the first end-to-end workflow.
 *
 * Creates a real mission, assigns the researcher, runs the agent through the
 * shared execution engine, and stores validated idea records.
 */
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
    businesses.find((b) => b.kind === 'youtube') ??
    null;

  if (!business) {
    return NextResponse.json(
      { error: 'No YouTube business exists yet. Create one in Settings → Businesses.' },
      { status: 409 },
    );
  }

  try {
    const { mission } = await createMission(store, {
      ownerId,
      businessId: business.id,
      title: `Find ${parsed.data.count} video opportunities`,
      objective: `Generate and score ${parsed.data.count} video opportunities in ${parsed.data.niche}.`,
      workflowKey: 'youtube_ideas',
      context: { niche: parsed.data.niche },
      seedInput: {
        count: parsed.data.count,
        niche: parsed.data.niche,
        audience: parsed.data.audience,
        instructions: parsed.data.instructions,
        channel_id: parsed.data.channel_id ?? null,
      },
    });

    const run = await runMission(store, ownerId, mission.id);
    const ideas = await store.list('youtube_ideas', {
      where: { mission_id: mission.id },
      orderBy: { column: 'score', ascending: false },
    });

    return NextResponse.json({ mission, run, ideas });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Idea generation failed.' },
      { status: 500 },
    );
  }
}
