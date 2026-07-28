import Link from 'next/link';
import { getWorkspace } from '@/lib/db/workspace';
import { formatRelativeTime } from '@/lib/utils';
import { Badge, DemoNotice, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';

export const dynamic = 'force-dynamic';

export default async function YoutubeScriptsPage() {
  const { store, business } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const scripts = await store.list('youtube_scripts', {
    where: { business_id: business.id },
    orderBy: { column: 'updated_at', ascending: false },
  });

  return (
    <PageShell
      title="Scripts"
      description="Structured documentary scripts with versions. Editing a section creates a new version rather than overwriting the last one."
      tabs={YOUTUBE_TABS}
      wide
    >
      {scripts.length === 0 ? (
        <Panel>
          <EmptyState
            title="No scripts yet"
            detail="Approve an idea to run research and drafting."
          />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {scripts.map((script) => (
            <Link key={script.id} href={`/youtube/scripts/${script.id}`}>
              <Panel className="h-full p-4 transition-colors hover:bg-white/[0.04]">
                <div className="flex items-start gap-3">
                  <h2 className="min-w-0 flex-1 text-[14px] font-medium leading-snug">
                    {script.title}
                  </h2>
                  <Badge
                    tone={
                      script.status === 'approved'
                        ? 'emerald'
                        : script.status === 'awaiting_approval'
                          ? 'amber'
                          : script.status === 'rejected'
                            ? 'red'
                            : 'neutral'
                    }
                  >
                    {script.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
                  {script.word_count.toLocaleString('en-GB')} words · ~
                  {Math.round(script.estimated_duration_seconds / 60)} minutes · v{script.version}
                </p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
                  <span>{script.tone}</span>
                  <span>· updated {formatRelativeTime(script.updated_at)}</span>
                  {script.is_demo && <DemoNotice />}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
