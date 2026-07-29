import { getWorkspace } from '@/lib/db/workspace';
import { getSourcePolicy, getVisualRules, usesIslamicWorkforce } from '@/lib/islamic/resolve';
import { PageShell } from '@/components/layout/PageShell';
import { Panel } from '@/components/ui';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { NoBusiness } from '@/components/youtube/NoBusiness';
import { SourcePolicyForm } from '@/components/youtube/SourcePolicyForm';
import { WorkspaceSwitcher } from '@/components/youtube/WorkspaceSwitcher';

export const dynamic = 'force-dynamic';

/**
 * Source Policy — a channel's editorial rules for religious sourcing and
 * visuals.
 *
 * Shown for every channel, because a channel that does not yet have Islamic
 * agents may be about to get some, but the page says plainly when nothing is
 * currently reading the settings.
 */
export default async function SourcePolicyPage() {
  const { store, ownerId, business, siblings } = await getWorkspace('youtube');
  if (!business) return <NoBusiness tabs={YOUTUBE_TABS} title="YouTube" />;

  const [policy, visual, active] = await Promise.all([
    getSourcePolicy(store, ownerId, business.id),
    getVisualRules(store, ownerId, business.id),
    usesIslamicWorkforce(store, ownerId, business.id),
  ]);

  return (
    <PageShell
      title="Source policy"
      description="How this channel wants religious sourcing and visuals handled. Every setting is a choice — nothing here assumes a school or a position."
      tabs={YOUTUBE_TABS}
      wide
      actions={
        <WorkspaceSwitcher
          kind="youtube"
          current={business.id}
          options={siblings.map((b) => ({ id: b.id, name: b.name, colour: b.colour }))}
        />
      }
    >
      {!active && (
        <Panel className="mb-4 border-amber-500/25 bg-amber-500/[0.07] p-4">
          <p className="text-[12px] leading-relaxed text-amber-100/80">
            <strong className="font-semibold">Nothing is reading these yet.</strong> {business.name}{' '}
            has no agent with an <code className="font-mono">islamic.*</code> capability, so the
            source policy is stored but not applied. Create an Islamic Content Researcher or Islamic
            Source Checker scoped to this channel and it takes effect immediately.
          </p>
        </Panel>
      )}

      <SourcePolicyForm
        businessId={business.id}
        businessName={business.name}
        policy={policy}
        visual={visual}
      />
    </PageShell>
  );
}
