import 'server-only';
import { buildLicenceReport } from '@/lib/production/licence-report';
import { isSimulatedProvider } from '@/lib/production/provenance';
import { formatDuration } from './script';
import { itemFromRecord } from '@/lib/approvals/review';
import type { DataStore } from '@/lib/db/tables';
import type { DossierBuilder } from './registry';
import type { DossierPart, LedgerLine, MediaItem, Metric, Panel } from './types';

/**
 * The final review: everything about a finished video, on one screen.
 *
 * This replaces the media dossier for `video` approvals, and the difference is
 * the point. The old one showed the file and the concepts. This one has to
 * answer a harder question — *may this be published?* — which means the picture
 * and the sound, but also the licences, the quality measurements, the money and
 * the exact things that are still missing.
 *
 * The rule the whole screen is built around: **approving is disabled until the
 * video can actually be played.** Everything else can be argued about; that one
 * cannot, because approving a video you have not watched is not a decision.
 */
export const studioDossier: DossierBuilder = {
  id: 'studio',
  kinds: ['video'],

  async build({ store, approval }): Promise<DossierPart | null> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const videoId = typeof payload.video_id === 'string' ? payload.video_id : null;
    if (!videoId) return null;

    const video = await store.get('youtube_videos', videoId).catch(() => null);
    if (!video) return null;

    const [finalAsset, thumbnail, metadata, captions, quality, timeline, script] =
      await Promise.all([
        video.final_asset_id
          ? store.get('media_assets', video.final_asset_id).catch(() => null)
          : Promise.resolve(null),
        video.thumbnail_asset_id
          ? store.get('media_assets', video.thumbnail_asset_id).catch(() => null)
          : Promise.resolve(null),
        video.metadata_id
          ? store.get('youtube_metadata', video.metadata_id).catch(() => null)
          : Promise.resolve(null),
        store
          .list('youtube_captions', { where: { video_id: video.id } })
          .catch(() => [])
          .then((rows) => rows[0] ?? null),
        store
          .list('youtube_quality_checks', { where: { video_id: video.id } })
          .catch(() => [])
          .then(
            (rows) =>
              [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
          ),
        video.timeline_id
          ? store.get('youtube_timelines', video.timeline_id).catch(() => null)
          : Promise.resolve(null),
        video.script_id
          ? store.get('youtube_scripts', video.script_id).catch(() => null)
          : Promise.resolve(null),
      ]);

    const licence = await buildLicenceReport(store, video);
    const costs = await costBreakdown(store, video);
    const playable = Boolean(finalAsset?.public_url);

    const panels: Panel[] = [];

    /* ---- The video itself -------------------------------------------- */
    const media: MediaItem[] = [];
    if (finalAsset) {
      media.push({
        id: finalAsset.id,
        label: 'The finished video',
        mediaKind: 'video',
        url: finalAsset.public_url,
        note: !finalAsset.public_url
          ? `The render is recorded as ${finalAsset.status} but no playable file is reachable. You cannot approve publishing until you can watch it.`
          : isSimulatedProvider(finalAsset.provider)
            ? 'Rendered by the simulated provider. This is a placeholder and must not be published.'
            : null,
        fields: [
          { label: 'Resolution', value: sizeOf(finalAsset, timeline) },
          { label: 'Duration', value: finalAsset.duration ? formatDuration(finalAsset.duration) : 'Unknown' },
          { label: 'File size', value: formatBytes(finalAsset.file_size) },
          { label: 'Render preset', value: presetOf(finalAsset) },
        ],
      });
    }
    if (thumbnail) {
      media.push({
        id: thumbnail.id,
        label: 'Selected thumbnail',
        mediaKind: 'image',
        url: thumbnail.public_url,
        note: isSimulatedProvider(thumbnail.provider)
          ? 'Simulated placeholder, not a real thumbnail.'
          : null,
        fields: [],
      });
    }

    panels.push({
      kind: 'media',
      id: 'video',
      title: 'Watch it',
      subtitle: playable
        ? 'Play the whole thing before you decide. This is the file that would be uploaded.'
        : null,
      note: playable
        ? null
        : 'There is no playable file. Approving for publishing is disabled until there is one.',
      items: media,
    });

    /* ---- Alternative thumbnails --------------------------------------- */
    const candidates = (
      await store.list('media_assets', { where: { business_id: video.business_id } }).catch(() => [])
    ).filter(
      (asset) =>
        asset.video_id === video.id &&
        asset.type === 'thumbnail' &&
        asset.id !== video.thumbnail_asset_id,
    );
    if (candidates.length > 0) {
      panels.push({
        kind: 'media',
        id: 'thumbnails',
        title: `Other thumbnails · ${candidates.length}`,
        subtitle: 'Rendered candidates that were not selected.',
        items: candidates.map((asset) => ({
          id: asset.id,
          label: `Candidate ${asset.id.slice(0, 8)}`,
          mediaKind: 'image' as const,
          url: asset.public_url,
          note: null,
          fields: [{ label: 'Provider', value: asset.provider }],
        })),
      });
    }

    /* ---- Metadata ------------------------------------------------------ */
    panels.push({
      kind: 'fields',
      id: 'metadata',
      title: 'What it would be published as',
      note: metadata ? null : 'No metadata has been written, so there is no title or description to publish.',
      fields: metadata
        ? [
            { label: 'Title', value: metadata.title },
            { label: 'Description', value: metadata.description, long: true },
            { label: 'Tags', value: metadata.tags.join(', '), long: true },
            ...(metadata.alternative_titles.length > 0
              ? [
                  {
                    label: 'Alternative titles',
                    value: metadata.alternative_titles.join('\n'),
                    long: true,
                  },
                ]
              : []),
            ...(metadata.chapters.length > 0
              ? [
                  {
                    label: 'Chapters',
                    value: metadata.chapters
                      .map((chapter) => `${stamp(chapter.start_seconds)} ${chapter.title}`)
                      .join('\n'),
                    long: true,
                  },
                ]
              : []),
            ...(metadata.hashtags.length > 0
              ? [{ label: 'Hashtags', value: metadata.hashtags.join(' ') }]
              : []),
            ...(metadata.pinned_comment
              ? [{ label: 'Pinned comment', value: metadata.pinned_comment, long: true }]
              : []),
          ]
        : [],
    });

    /* ---- Captions ------------------------------------------------------ */
    panels.push({
      kind: 'fields',
      id: 'captions',
      title: 'Subtitles',
      note: captions
        ? captions.aligned
          ? null
          : 'Timings were fitted to the narration length rather than heard from the audio, so individual lines may drift.'
        : 'No captions were generated. Nothing would be uploaded as a caption track.',
      fields: captions
        ? [
            { label: 'Cues', value: String(captions.cues.length) },
            { label: 'Language', value: captions.language },
            { label: 'Timing', value: captions.aligned ? 'Aligned to the audio' : 'Fitted to the narration length' },
            {
              label: 'First lines',
              value: captions.cues
                .slice(0, 6)
                .map((cue) => `${stamp(cue.startSeconds)}  ${cue.text}`)
                .join('\n'),
              long: true,
            },
          ]
        : [],
    });

    /* ---- Licences ------------------------------------------------------ */
    panels.push({
      kind: 'items',
      id: 'licences',
      title: 'Where every picture came from',
      subtitle: `${licence.records.length} visual asset${licence.records.length === 1 ? '' : 's'}${
        licence.blocking.length > 0 ? ` · ${licence.blocking.length} blocking` : ''
      }${licence.manualReview.length > 0 ? ` · ${licence.manualReview.length} need your judgement` : ''}`,
      note: licence.disclaimer,
      itemNoun: 'asset',
      items: licence.records.map((record) => ({
        id: record.assetId,
        title: record.provenance.replace(/_/g, ' '),
        subtitle: record.reason,
        badges: [
          {
            label: record.provenance === 'unresolved' ? 'Blocking' : record.provenance === 'fair_use_review_required' ? 'Your call' : 'Cleared',
            tone:
              record.provenance === 'unresolved'
                ? ('red' as const)
                : record.provenance === 'fair_use_review_required'
                  ? ('amber' as const)
                  : ('emerald' as const),
          },
        ],
        fields: [
          { label: 'Scenes', value: record.scenes.length > 0 ? record.scenes.join(', ') : '—' },
          { label: 'Provider', value: record.provider },
          ...(record.creator ? [{ label: 'Creator', value: record.creator }] : []),
          ...(record.licence ? [{ label: 'Licence', value: record.licence }] : []),
          ...(record.source ? [{ label: 'Source', value: record.source }] : []),
          ...(record.restrictions.length > 0
            ? [{ label: 'Restrictions', value: record.restrictions.join(' '), long: true }]
            : []),
        ],
      })),
    });

    /* ---- Quality control ----------------------------------------------- */
    if (quality) {
      panels.push({
        kind: 'items',
        id: 'quality',
        title: `Quality control · ${quality.verdict}`,
        subtitle: quality.summary,
        itemNoun: 'issue',
        items:
          quality.issues.length > 0
            ? quality.issues.map((issue, index) => ({
                id: `${issue.code}-${index}`,
                title: issue.message,
                subtitle: issue.remedy,
                badges: [
                  {
                    label: issue.severity,
                    tone: issue.severity === 'blocking' ? ('red' as const) : ('amber' as const),
                  },
                ],
                fields: [],
              }))
            : [
                {
                  id: 'clean',
                  title: 'Nothing was flagged.',
                  subtitle: null,
                  fields: Object.entries(quality.measured ?? {}).map(([key, value]) => ({
                    label: key.replace(/_/g, ' '),
                    value: String(value ?? 'not measured'),
                  })),
                },
              ],
      });
    }

    /* ---- Money ---------------------------------------------------------- */
    panels.push({
      kind: 'ledger',
      id: 'cost',
      title: 'What it cost to make',
      lines: costs,
    });

    /* ---- Blockers -------------------------------------------------------- */
    const blockers = [
      ...(playable ? [] : ['There is no playable video file.']),
      ...(thumbnail ? [] : ['No thumbnail has been selected.']),
      ...(metadata ? [] : ['No title or description has been written.']),
      ...licence.blocking.map((record) => `Unresolved asset licence: ${record.reason}`),
      ...(quality?.verdict === 'fail' ? ['Quality control failed.'] : []),
    ];

    return {
      summary: {
        title: video.title,
        subtitle: metadata?.title && metadata.title !== video.title ? metadata.title : null,
        attribution: [{ label: 'Stage', value: video.stage.replace(/_/g, ' ') }],
        metrics: summaryMetrics(video, finalAsset, timeline, costs, script?.version ?? null),
        notice:
          blockers.length > 0
            ? `Not ready to publish: ${blockers.join(' ')}`
            : licence.manualReview.length > 0
              ? `${licence.manualReview.length} asset(s) need your judgement before publishing. Command Centre makes no legal guarantee either way.`
              : null,
      },
      panels,
      href: `/youtube/production/${video.id}`,
      approveConsequence: playable
        ? 'Approving marks the video ready to publish. It does not upload it — publishing is a separate, gated action, and the first upload is private.'
        : 'You cannot approve this: there is no playable video to watch.',
      source: 'records',
    };
  },
};

/* ------------------------------------------------------------------ */

function summaryMetrics(
  video: { estimated_cost: number; actual_cost: number; status: string },
  finalAsset: { duration: number | null; file_size: number | null; metadata: unknown } | null,
  timeline: { width: number; height: number; total_duration: number } | null,
  costs: LedgerLine[],
  scriptVersion: number | null,
): Metric[] {
  const total = costs.find((line) => line.emphasis)?.value ?? '—';
  return [
    { label: 'Status', value: video.status.replace(/_/g, ' ') },
    {
      label: 'Duration',
      value: finalAsset?.duration
        ? formatDuration(finalAsset.duration)
        : timeline
          ? `${formatDuration(timeline.total_duration)} (planned)`
          : 'Unknown',
      hint: finalAsset?.duration ? 'Measured from the rendered file.' : undefined,
    },
    {
      label: 'Resolution',
      value: timeline ? `${timeline.width}×${timeline.height}` : 'Unknown',
    },
    { label: 'File size', value: formatBytes(finalAsset?.file_size ?? null) },
    { label: 'Render preset', value: finalAsset ? presetOf(finalAsset) : '—' },
    { label: 'Script version', value: scriptVersion ? `v${scriptVersion}` : 'Unknown' },
    { label: 'Total cost', value: total, tone: 'amber' },
  ];
}

/**
 * Spend grouped by what it was spent on.
 *
 * Model calls come from `api_usage`; everything else comes from the assets
 * themselves, because each records what its provider charged. Nothing is
 * apportioned or estimated — a line that cannot be read is absent rather than
 * guessed.
 */
async function costBreakdown(
  store: DataStore,
  video: { id: string; business_id: string; mission_id: string | null; actual_cost: number },
): Promise<LedgerLine[]> {
  const tasks = video.mission_id
    ? await store.list('tasks', { where: { mission_id: video.mission_id } }).catch(() => [])
    : [];
  const usage = (
    await Promise.all(
      tasks.map((task) => store.list('api_usage', { where: { task_id: task.id } }).catch(() => [])),
    )
  ).flat();
  const assets = (
    await store.list('media_assets', { where: { business_id: video.business_id } }).catch(() => [])
  ).filter((asset) => asset.video_id === video.id);

  const model = usage.reduce((sum, row) => sum + row.estimated_cost, 0);
  const byProvider = new Map<string, number>();
  for (const asset of assets) {
    if (asset.generation_cost <= 0) continue;
    byProvider.set(asset.provider, (byProvider.get(asset.provider) ?? 0) + asset.generation_cost);
  }

  const money = (value: number) => `£${value.toFixed(2)}`;
  const lines: LedgerLine[] = [
    { label: 'Anthropic (writing and review)', value: money(model), hint: `${usage.length} model calls` },
    ...[...byProvider.entries()].map(([provider, amount]) => ({
      label: provider,
      value: money(amount),
    })),
  ];

  // Rendering is local CPU, so it is free in money and worth saying so rather
  // than omitting — an absent line reads as an unknown cost.
  lines.push({ label: 'Rendering (local)', value: money(0), hint: 'Local ffmpeg. No provider charge.' });

  const total = model + [...byProvider.values()].reduce((a, b) => a + b, 0);
  lines.push({
    label: 'Total',
    value: money(total),
    emphasis: true,
    tone: 'amber',
    hint: 'Already spent. Rejecting does not refund it.',
  });
  return lines;
}

function sizeOf(
  asset: { width: number | null; height: number | null },
  timeline: { width: number; height: number } | null,
): string {
  if (asset.width && asset.height) return `${asset.width}×${asset.height}`;
  return timeline ? `${timeline.width}×${timeline.height}` : 'Unknown';
}

function presetOf(asset: { metadata: unknown }): string {
  const preset = (asset.metadata as Record<string, unknown>)?.preset;
  return typeof preset === 'string' ? preset : 'standard';
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

function stamp(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = String(Math.floor(whole / 60)).padStart(2, '0');
  const s = String(whole % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Kept so the generic item renderer stays importable from one place. */
export { itemFromRecord };
