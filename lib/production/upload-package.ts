import 'server-only';
import { describeMode } from '@/lib/modes';
import { playableUrl } from '@/lib/media/assets';
import type { DataStore } from '@/lib/db/tables';
import type { YoutubeVideo } from '@/types/domain';

/**
 * Everything that leaves the building with a video.
 *
 * Assembled from stored records at the moment it is asked for, never
 * pre-computed: a package built at render time and cached would go stale the
 * first time metadata was edited, and the operator would download a manifest
 * describing a video that no longer exists.
 *
 * Two rules shape it. Nothing is invented — a section with no underlying record
 * says so rather than being omitted, because a licence report that is missing
 * and a licence report that is empty mean very different things to whoever
 * signs off the upload. And every figure carries its provenance, so the AI cost
 * report is auditable against `api_usage` rather than being a number someone
 * has to trust.
 */

export interface PackageFile {
  name: string;
  kind: 'video' | 'image' | 'audio' | 'text';
  /** Null when the asset exists as a record but not as a reachable file. */
  url: string | null;
  note: string | null;
}

export interface PackageSection {
  id: string;
  title: string;
  /** Markdown. Empty string when there is genuinely nothing to say. */
  body: string;
  /** Set when the section could not be built, with the reason. */
  missing: string | null;
}

export interface UploadPackage {
  video: { id: string; title: string; status: string; stage: string };
  mode: ReturnType<typeof describeMode>;
  /** Blocks the operator must clear before the Publish button means anything. */
  blockers: string[];
  files: PackageFile[];
  sections: PackageSection[];
  /** The whole package as one Markdown document, for download. */
  markdown: string;
}

const money = (value: number) => `£${value.toFixed(2)}`;

export async function buildUploadPackage(
  store: DataStore,
  video: YoutubeVideo,
): Promise<UploadPackage> {
  const [metadata, captions, copyright, script, tasks] = await Promise.all([
    video.metadata_id
      ? store.get('youtube_metadata', video.metadata_id).catch(() => null)
      : Promise.resolve(null),
    store
      .list('youtube_captions', { where: { video_id: video.id } })
      .catch(() => [])
      .then((rows) => rows[0] ?? null),
    store
      .list('youtube_copyright_reviews', { where: { video_id: video.id } })
      .catch(() => [])
      .then((rows) => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null),
    video.script_id
      ? store.get('youtube_scripts', video.script_id).catch(() => null)
      : Promise.resolve(null),
    video.mission_id
      ? store.list('tasks', { where: { mission_id: video.mission_id } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const usage = (
    await Promise.all(
      tasks.map((task) => store.list('api_usage', { where: { task_id: task.id } }).catch(() => [])),
    )
  ).flat();

  const [finalAsset, thumbnailAsset] = await Promise.all([
    video.final_asset_id
      ? store.get('media_assets', video.final_asset_id).catch(() => null)
      : Promise.resolve(null),
    video.thumbnail_asset_id
      ? store.get('media_assets', video.thumbnail_asset_id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const files: PackageFile[] = [
    {
      name: 'video.mp4',
      kind: 'video',
      url: playableUrl(finalAsset),
      note: finalAsset
        ? finalAsset.provider === 'simulated'
          ? 'Rendered by the simulated provider. It is a placeholder and must not be published.'
          : null
        : 'No rendered file exists yet.',
    },
    {
      name: 'thumbnail.png',
      kind: 'image',
      url: playableUrl(thumbnailAsset),
      note: thumbnailAsset ? null : 'No thumbnail has been selected.',
    },
    {
      name: 'captions.vtt',
      kind: 'text',
      url: null,
      note: captions
        ? captions.aligned
          ? null
          : 'Timings were estimated from the script rather than heard from the narration, so they will drift.'
        : 'No captions have been generated.',
    },
  ];

  const sections: PackageSection[] = [];
  const push = (id: string, title: string, body: string, missing: string | null = null) =>
    sections.push({ id, title, body, missing });

  push(
    'title',
    'Title',
    metadata ? metadata.title : '',
    metadata ? null : 'Metadata has not been written yet.',
  );
  push(
    'description',
    'Description',
    metadata ? metadata.description : '',
    metadata ? null : 'Metadata has not been written yet.',
  );
  push('tags', 'Tags', metadata ? metadata.tags.join(', ') : '', metadata ? null : 'Not written.');
  push(
    'chapters',
    'Chapters',
    metadata && metadata.chapters.length > 0
      ? metadata.chapters
          .map((chapter) => `${formatStamp(chapter.start_seconds)} ${chapter.title}`)
          .join('\n')
      : '',
    metadata?.chapters.length ? null : 'No chapters were written.',
  );
  push(
    'pinned_comment',
    'Pinned comment',
    metadata?.pinned_comment ?? '',
    metadata?.pinned_comment ? null : 'None written.',
  );
  push(
    'transcript',
    'Transcript',
    script ? script.sections.map((section) => section.body).join('\n\n') : '',
    script ? null : 'The script could not be read.',
  );
  push(
    'captions',
    'Captions (WebVTT)',
    captions?.vtt ?? '',
    captions ? null : 'No captions have been generated.',
  );

  // Sources come from the research the script was built on, so the licence
  // report and the source list are separate things and stay separate.
  const research = script?.research_id
    ? await store.get('youtube_research', script.research_id).catch(() => null)
    : null;
  const sources = [...(research?.facts ?? []), ...(research?.statistics ?? [])]
    .map((fact) => fact.source)
    .filter((source): source is string => Boolean(source));
  push(
    'sources',
    'Sources',
    [...new Set(sources)].map((source) => `- ${source}`).join('\n'),
    sources.length === 0 ? 'No sources were recorded for this video.' : null,
  );

  push(
    'licences',
    'Licence report',
    copyright
      ? [
          `Verdict: ${copyright.verdict}`,
          copyright.summary,
          '',
          ...copyright.findings.map(
            (finding) => `- [${finding.severity}] ${finding.asset}: ${finding.detail}`,
          ),
          '',
          ...(copyright.attribution_required.length > 0
            ? ['Attribution to include in the description:', ...copyright.attribution_required.map((line) => `- ${line}`)]
            : []),
        ].join('\n')
      : '',
    copyright ? null : 'No copyright review has been run. Nothing has been checked.',
  );

  const aiCost = usage.reduce((total, row) => total + row.estimated_cost, 0);
  push(
    'cost',
    'AI cost report',
    [
      `Model calls: ${usage.length}`,
      `Model spend: ${money(aiCost)}`,
      `Recorded production spend: ${money(video.actual_cost)}`,
      `Estimated at planning: ${money(video.estimated_cost)}`,
      '',
      ...usage.slice(0, 40).map(
        (row) =>
          `- ${row.model} · ${row.input_tokens + row.output_tokens} tokens · ${money(row.estimated_cost)}`,
      ),
    ].join('\n'),
  );

  const blockers: string[] = [];
  if (!finalAsset) blockers.push('There is no rendered video file.');
  if (finalAsset?.provider === 'simulated') {
    blockers.push('The rendered file came from the simulated provider and must not be published.');
  }
  if (!thumbnailAsset) blockers.push('No thumbnail has been selected.');
  if (!metadata) blockers.push('The title, description and tags have not been written.');
  if (!copyright) blockers.push('No copyright review has been run.');
  else if (copyright.verdict === 'blocked') {
    blockers.push(`The copyright review blocked this video: ${copyright.summary}`);
  }
  if (video.status !== 'ready' && video.status !== 'published') {
    blockers.push('The video has not been approved in the final review.');
  }

  return {
    video: { id: video.id, title: video.title, status: video.status, stage: video.stage },
    mode: describeMode(),
    blockers,
    files,
    sections,
    markdown: toMarkdown(video, files, sections, blockers),
  };
}

function formatStamp(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = String(Math.floor(whole / 60)).padStart(2, '0');
  const s = String(whole % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function toMarkdown(
  video: YoutubeVideo,
  files: PackageFile[],
  sections: PackageSection[],
  blockers: string[],
): string {
  const lines = [`# Upload package — ${video.title}`, ''];

  if (blockers.length > 0) {
    lines.push('## Not ready to publish', '');
    for (const blocker of blockers) lines.push(`- ${blocker}`);
    lines.push('');
  }

  lines.push('## Files', '');
  for (const file of files) {
    lines.push(`- **${file.name}** — ${file.url ?? 'not available'}${file.note ? ` (${file.note})` : ''}`);
  }
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section.title}`, '');
    lines.push(section.missing ? `_${section.missing}_` : section.body || '_Empty._');
    lines.push('');
  }
  return lines.join('\n');
}
