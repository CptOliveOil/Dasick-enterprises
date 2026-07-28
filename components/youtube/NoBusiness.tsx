import Link from 'next/link';
import { EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';

/** Shown when a workspace has no backing business rather than faking one. */
export function NoBusiness({
  tabs,
  title,
}: {
  tabs: { href: string; label: string }[];
  title: string;
}) {
  return (
    <PageShell title={title} tabs={tabs}>
      <Panel>
        <EmptyState
          title={`No ${title} business exists yet`}
          detail="Workspaces are backed by a business record. Create one in Settings → Businesses and this workspace will populate."
          action={
            <Link
              href="/settings"
              className="text-[13px] text-amber-400 underline-offset-4 hover:underline"
            >
              Open settings →
            </Link>
          }
        />
      </Panel>
    </PageShell>
  );
}
