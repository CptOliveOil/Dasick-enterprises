import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStore } from '@/lib/db';
import { buildProductionSummary } from '@/lib/production/summary';
import { formatMoneyPrecise, formatRelativeTime, missionLabel } from '@/lib/utils';
import { Badge, Panel } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';
import { YOUTUBE_TABS } from '@/components/youtube/tabs';
import { PipelineTrack } from '@/components/youtube/PipelineTrack';
import { SceneEditor } from '@/components/youtube/SceneEditor';
import {
  ProductionControls,
  VideoPreview,
} from '@/components/youtube/ProductionControls';
import type { QualitySeverity } from '@/types/production';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<QualitySeverity, 'neutral' | 'amber' | 'red'> = {
  info: 'neutral',
  warning: 'amber',
  blocking: 'red',
};

export default async function VideoProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { store, ownerId } = await getStore();
  const summary = await buildProductionSummary(store, ownerId, id);
  if (!summary) notFound();

  const { video, scenes, assets, voiceover, metadata, qualityCheck, cost } = summary;
  const mission = video.mission_id ? await store.get('missions', video.mission_id) : null;
  const finalVideo = assets.find((a) => a.type === 'final_video' && a.status === 'ready') ?? null;
  const thumbnails = assets.filter((a) => a.type === 'thumbnail' && a.status === 'ready');
  const captions = assets.filter((a) => a.type === 'subtitle_file');
  const narration = voiceover?.audio_asset_id
    ? (assets.find((a) => a.id === voiceover.audio_asset_id) ?? null)
    : null;

  return (
    <PageShell
      title={video.title}
      description={`Video #${String(video.number).padStart(3, '0')} · ${video.status.replace('_', ' ')}`}
      tabs={YOUTUBE_TABS}
      wide
      actions={
        mission ? (
          <Link
            href={`/missions/${mission.id}`}
            className="text-[12px] text-amber-400 underline-offset-4 hover:underline"
          >
            Mission {missionLabel(mission.number)} →
          </Link>
        ) : undefined
      }
    >
      <Section title="Production pipeline">
        <Panel className="p-3">
          <PipelineTrack stages={summary.stages} />
        </Panel>
      </Section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <Section title="Preview">
            <VideoPreview asset={finalVideo} containsSimulated={summary.containsSimulated} />
          </Section>

          <Section title={`Scenes · ${scenes.length}`}>
            <SceneEditor videoId={video.id} scenes={scenes} assets={assets} />
          </Section>
        </div>

        <div>
          <Section title="Cost">
            <Panel className="p-4">
              <dl className="space-y-1.5 text-[13px]">
                <CostRow label="Research & writing" value={cost.research_and_writing} />
                <CostRow label="Voice" value={cost.voice} />
                <CostRow label="Images" value={cost.images} />
                <CostRow label="Video generation" value={cost.video} />
                <CostRow label="Rendering" value={cost.rendering} />
                {cost.other > 0 && <CostRow label="Other" value={cost.other} />}
                <div className="flex items-baseline justify-between border-t border-[var(--color-edge-soft)] pt-2 text-[15px] font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoneyPrecise(cost.total)}</dd>
                </div>
              </dl>
              {cost.total === 0 && (
                <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                  Nothing has been spent. Simulated providers and the local renderer are free.
                </p>
              )}
            </Panel>
          </Section>

          <Section title="Quality check">
            <Panel className="p-4">
              {qualityCheck ? (
                <>
                  <p className="flex items-center gap-2">
                    <Badge
                      tone={
                        qualityCheck.verdict === 'pass'
                          ? 'emerald'
                          : qualityCheck.verdict === 'warning'
                            ? 'amber'
                            : 'red'
                      }
                    >
                      {qualityCheck.verdict.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] text-[var(--color-ink-faint)]">
                      {formatRelativeTime(qualityCheck.created_at)}
                    </span>
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                    {qualityCheck.summary}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--color-edge-soft)] pt-2.5 text-[11px]">
                    <Measured label="Duration" value={
                      qualityCheck.measured.duration_seconds
                        ? `${Math.round(qualityCheck.measured.duration_seconds)}s`
                        : '—'
                    } />
                    <Measured
                      label="Audio"
                      value={qualityCheck.measured.has_audio_track ? 'Present' : 'Missing'}
                    />
                    <Measured
                      label="Resolution"
                      value={
                        qualityCheck.measured.width
                          ? `${qualityCheck.measured.width}×${qualityCheck.measured.height}`
                          : '—'
                      }
                    />
                    <Measured
                      label="File size"
                      value={
                        qualityCheck.measured.file_size
                          ? `${(qualityCheck.measured.file_size / 1024 / 1024).toFixed(1)} MB`
                          : '—'
                      }
                    />
                  </dl>
                  {qualityCheck.issues.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {qualityCheck.issues.map((issue, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5"
                        >
                          <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
                          <p className="mt-1.5 text-[12px] leading-snug">{issue.message}</p>
                          <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                            {issue.remedy}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-[var(--color-ink-muted)]">
                  Not checked yet. Quality control runs after the video is assembled.
                </p>
              )}
            </Panel>
          </Section>

          <Section title="Package">
            <Panel className="p-4">
              <dl className="space-y-2 text-[12px]">
                <PackageRow
                  label="Narration"
                  value={
                    narration
                      ? `${Math.round(narration.duration ?? 0)}s${narration.simulated ? ' (simulated)' : ''}`
                      : 'Not generated'
                  }
                  href={narration ? `/api/media/${narration.id}` : null}
                />
                <PackageRow
                  label="Thumbnail"
                  value={video.thumbnail_asset_id ? 'Selected' : `${thumbnails.length} candidates`}
                  href={video.thumbnail_asset_id ? `/api/media/${video.thumbnail_asset_id}` : null}
                />
                <PackageRow
                  label="Captions"
                  value={captions.length > 0 ? `${captions.length} files` : 'None'}
                  href={captions[0] ? `/api/media/${captions[0].id}?download=1` : null}
                />
                <PackageRow
                  label="Title"
                  value={metadata?.title ?? 'Not written'}
                  href={null}
                />
                <PackageRow
                  label="Tags"
                  value={metadata ? `${metadata.tags.length}` : '—'}
                  href={null}
                />
              </dl>
              {metadata && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-[var(--color-ink-muted)]">
                    Description
                  </summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                    {metadata.description}
                  </p>
                </details>
              )}
            </Panel>
          </Section>

          <ProductionControls
            videoId={video.id}
            blockedReason={video.blocked_reason}
            thumbnails={thumbnails}
            selectedThumbnailId={video.thumbnail_asset_id}
          />
        </div>
      </div>
    </PageShell>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="tabular-nums">{formatMoneyPrecise(value)}</dd>
    </div>
  );
}

function Measured({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="mt-0.5 text-[12px]">{value}</dd>
    </div>
  );
}

function PackageRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right">
        {href ? (
          <a href={href} className="text-amber-400 underline-offset-4 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
