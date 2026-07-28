import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/ids';
import { getStore } from '@/lib/db';
import { logActivity } from '@/lib/agents/activity';
import { scriptSectionSchema } from '@/schemas/youtube';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sections: z.array(scriptSectionSchema).min(1),
  note: z.string().max(200).default('Manual edit'),
});

/** Manual editing. Every save becomes a new version — nothing is overwritten. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid script sections.' }, { status: 400 });
  }

  const { store, ownerId } = await getStore();
  const script = await store.get('youtube_scripts', id);
  if (!script) return NextResponse.json({ error: 'Script not found.' }, { status: 404 });

  const sections = parsed.data.sections;
  const wordCount = sections.reduce(
    (total, section) => total + section.body.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const version = script.version + 1;
  const timestamp = new Date().toISOString();

  const updated = await store.update('youtube_scripts', id, {
    sections,
    word_count: wordCount,
    estimated_duration_seconds: Math.round((wordCount / 155) * 60),
    version,
    // An edit invalidates any previous verification.
    status: 'draft',
    updated_at: timestamp,
  });

  await store.insert('youtube_script_versions', {
    id: uuid(),
    script_id: id,
    version,
    sections,
    note: parsed.data.note,
    created_at: timestamp,
  });

  await logActivity(store, {
    ownerId,
    businessId: script.business_id,
    kind: 'system',
    message: `Script "${script.title}" edited — saved as v${version}`,
  });

  return NextResponse.json(updated);
}
