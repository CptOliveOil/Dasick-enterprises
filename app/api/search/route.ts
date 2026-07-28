import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Global search across everything the operator can act on. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  if (query.length < 2) return NextResponse.json({ results: [] });

  const { store, ownerId } = await getStore();
  const matches = (...fields: (string | null | undefined)[]) =>
    fields.some((field) => field?.toLowerCase().includes(query));

  const [agents, missions, tasks, businesses, ideas, scripts, videos, products, activity] =
    await Promise.all([
      store.list('agents', { where: { owner_id: ownerId } }),
      store.list('missions', { where: { owner_id: ownerId } }),
      store.list('tasks', { where: { owner_id: ownerId }, limit: 400 }),
      store.list('businesses', { where: { owner_id: ownerId } }),
      store.list('youtube_ideas'),
      store.list('youtube_scripts'),
      store.list('youtube_videos'),
      store.list('etsy_products'),
      store.list('activity_logs', { where: { owner_id: ownerId }, limit: 200 }),
    ]);

  const results: SearchResult[] = [
    ...agents
      .filter((a) => matches(a.name, a.role, a.description))
      .map((a) => ({
        id: a.id,
        type: 'Agent',
        title: a.name,
        subtitle: a.role,
        href: `/agents/${a.slug}`,
      })),
    ...missions
      .filter((m) => matches(m.title, m.objective))
      .map((m) => ({
        id: m.id,
        type: 'Mission',
        title: `#${String(m.number).padStart(3, '0')} ${m.title}`,
        subtitle: m.status,
        href: `/missions/${m.id}`,
      })),
    ...tasks
      .filter((t) => matches(t.title, t.description))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        type: 'Task',
        title: t.title,
        subtitle: t.status,
        href: `/tasks`,
      })),
    ...businesses
      .filter((b) => matches(b.name, b.description))
      .map((b) => ({
        id: b.id,
        type: 'Business',
        title: b.name,
        subtitle: b.description,
        href: `/${b.slug}`,
      })),
    ...ideas
      .filter((i) => matches(i.title, i.topic, i.summary))
      .slice(0, 20)
      .map((i) => ({
        id: i.id,
        type: 'Idea',
        title: i.title,
        subtitle: `Score ${i.score} · ${i.status}`,
        href: '/youtube/ideas',
      })),
    ...scripts
      .filter((s) => matches(s.title))
      .map((s) => ({
        id: s.id,
        type: 'Script',
        title: s.title,
        subtitle: `${s.word_count} words · ${s.status}`,
        href: `/youtube/scripts/${s.id}`,
      })),
    ...videos
      .filter((v) => matches(v.title))
      .map((v) => ({
        id: v.id,
        type: 'Video',
        title: `#${String(v.number).padStart(3, '0')} ${v.title}`,
        subtitle: v.status,
        href: '/youtube/videos',
      })),
    ...products
      .filter((p) => matches(p.name, p.description))
      .map((p) => ({
        id: p.id,
        type: 'Product',
        title: p.name,
        subtitle: p.status,
        href: '/etsy/products',
      })),
    ...activity
      .filter((a) => matches(a.message))
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        type: 'Activity',
        title: a.message,
        subtitle: new Date(a.created_at).toLocaleString('en-GB'),
        href: '/activity',
      })),
  ];

  return NextResponse.json({ results: results.slice(0, 40) });
}
