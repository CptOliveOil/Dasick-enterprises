import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { handleCommand } from '@/lib/agents/manager';
import { runMission } from '@/lib/workflows/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  instruction: z.string().min(1).max(2000),
  /** When false the mission is created but no agent runs yet. */
  execute: z.boolean().default(true),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide an instruction between 1 and 2000 characters.' },
      { status: 400 },
    );
  }

  const { store, ownerId } = await getStore();

  try {
    const result = await handleCommand(store, ownerId, parsed.data.instruction);
    if (!result.mission) {
      return NextResponse.json({ ...result, run: null, runs: [] });
    }

    // A bulk request produced several missions; advance each one.
    const runs = parsed.data.execute
      ? await Promise.all(
          result.missions.map((mission) => runMission(store, ownerId, mission.id)),
        )
      : [];

    return NextResponse.json({ ...result, run: runs[0] ?? null, runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The command could not be executed.' },
      { status: 500 },
    );
  }
}
