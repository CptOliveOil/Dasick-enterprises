import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

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

  const { store, ownerId } = await getSession();
  const matches = (...fields: (string | null | undefined)[]) =>
    fields.some((field) => field?.toLowerCase().includes(query));

  const [
    agents,
    missions,
    tasks,
    businesses,
    approvals,
    commands,
    allIdeas,
    allScripts,
    allVideos,
    allProducts,
    activity,
  ] = await Promise.all([
    store.list('agents', { where: { owner_id: ownerId } }),
    store.list('missions', { where: { owner_id: ownerId } }),
    store.list('tasks', { where: { owner_id: ownerId }, limit: 400 }),
    store.list('businesses', { where: { owner_id: ownerId } }),
    store.list('approvals', { where: { owner_id: ownerId } }),
    store.list('command_messages', { where: { owner_id: ownerId }, limit: 200 }),
    store.list('youtube_ideas'),
    store.list('youtube_scripts'),
    store.list('youtube_videos'),
    store.list('etsy_products'),
    store.list('activity_logs', { where: { owner_id: ownerId }, limit: 200 }),
  ]);

  // Child tables carry a business rather than an owner. Under Supabase, RLS
  // already restricts them; the explicit filter is what makes that true in the
  // in-memory driver too, so search can never be the one place that reaches
  // across accounts.
  const mine = new Set(businesses.map((business) => business.id));
  const owned = <T extends { business_id: string }>(rows: T[]) =>
    rows.filter((row) => mine.has(row.business_id));

  const ideas = owned(allIdeas);
  const scripts = owned(allScripts);
  const videos = owned(allVideos);
  const products = owned(allProducts);

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
    ...approvals
      .filter((a) => a.status === 'pending' && matches(a.title, a.summary))
      .map((a) => ({
        id: a.id,
        type: 'Approval',
        title: a.title,
        subtitle: a.kind,
        href: '/approvals',
      })),
    ...commands
      .filter((c) => c.role === 'user' && matches(c.content))
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        type: 'Command',
        title: c.content,
        subtitle: new Date(c.created_at).toLocaleString('en-GB'),
        href: '/command/history',
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
