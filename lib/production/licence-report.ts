import 'server-only';
import { summariseProvenance, type ProvenanceRecord } from './provenance';
import type { DataStore } from '@/lib/db/tables';
import type { YoutubeVideo } from '@/types/domain';

/**
 * The document that says where every picture came from.
 *
 * It exists to be *kept*, not just read: if a claim ever arrives, the useful
 * artefact is a dated record of what was used, under what licence, and who
 * decided. Assembled from stored rows each time it is asked for, so it can
 * never describe a video that has since changed.
 *
 * It states plainly that it is not legal advice, because a document that lists
 * licences and reaches a verdict reads like clearance whether or not anyone
 * intended it to.
 */

export interface LicenceReport {
  video: { id: string; title: string };
  generatedAt: string;
  records: (ProvenanceRecord & { scenes: number[] })[];
  blocking: ProvenanceRecord[];
  manualReview: ProvenanceRecord[];
  attributions: string[];
  counts: Record<string, number>;
  /** Assets still needing a person's decision, in the operator's words. */
  disclaimer: string;
}

const DISCLAIMER =
  'This report records what Command Centre stored about each asset. It is not legal advice and it is not a clearance. Command Centre cannot verify a licence, cannot judge fair dealing, and makes no guarantee that publishing this video is lawful. Items marked as needing your judgement are yours to decide.';

export async function buildLicenceReport(
  store: DataStore,
  video: YoutubeVideo,
): Promise<LicenceReport> {
  const [assets, scenes] = await Promise.all([
    store.list('media_assets', { where: { business_id: video.business_id } }).catch(() => []),
    store.list('youtube_scenes', { where: { video_id: video.id } }).catch(() => []),
  ]);
  const forVideo = assets.filter((asset) => asset.video_id === video.id);
  const summary = summariseProvenance(forVideo);

  // Which scene each asset appears in, so a finding points at a shot rather
  // than at a uuid.
  const scenesByAsset = new Map<string, number[]>();
  for (const scene of scenes) {
    if (!scene.asset_id) continue;
    scenesByAsset.set(scene.asset_id, [
      ...(scenesByAsset.get(scene.asset_id) ?? []),
      scene.scene_number,
    ]);
  }

  return {
    video: { id: video.id, title: video.title },
    generatedAt: new Date().toISOString(),
    records: summary.records.map((record) => ({
      ...record,
      scenes: scenesByAsset.get(record.assetId) ?? [],
    })),
    blocking: summary.blocking,
    manualReview: summary.manualReview,
    attributions: summary.attributions,
    counts: summary.counts,
    disclaimer: DISCLAIMER,
  };
}

/** The same report as one downloadable document. */
export function licenceReportMarkdown(report: LicenceReport): string {
  const lines = [
    `# Licence report — ${report.video.title}`,
    '',
    `Generated ${new Date(report.generatedAt).toLocaleString('en-GB')}`,
    '',
    `> ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    ...Object.entries(report.counts)
      .filter(([, count]) => count > 0)
      .map(([provenance, count]) => `- ${provenance.replace(/_/g, ' ')}: ${count}`),
    '',
  ];

  if (report.blocking.length > 0) {
    lines.push('## Blocking — these stop publishing', '');
    for (const record of report.blocking) {
      lines.push(`- \`${record.assetId}\` — ${record.reason}`);
    }
    lines.push('');
  }

  if (report.manualReview.length > 0) {
    lines.push('## Needs your judgement', '');
    for (const record of report.manualReview) {
      lines.push(`- \`${record.assetId}\` — ${record.reason}`);
    }
    lines.push('');
  }

  if (report.attributions.length > 0) {
    lines.push('## Attribution — put these in the description', '');
    for (const line of report.attributions) lines.push(`- ${line}`);
    lines.push('');
  }

  lines.push('## Every asset', '');
  for (const record of report.records) {
    lines.push(
      `### ${record.assetId}`,
      '',
      `- Provenance: **${record.provenance.replace(/_/g, ' ')}**`,
      `- Scenes: ${record.scenes.length > 0 ? record.scenes.join(', ') : 'not placed in a scene'}`,
      `- Provider: ${record.provider}`,
      `- Creator: ${record.creator ?? '—'}`,
      `- Licence: ${record.licence ?? '—'}`,
      `- Source: ${record.source ?? '—'}`,
      `- Retrieved: ${record.retrievedAt ? new Date(record.retrievedAt).toLocaleString('en-GB') : '—'}`,
      ...(record.restrictions.length > 0
        ? [`- Restrictions: ${record.restrictions.join(' ')}`]
        : []),
      `- Why: ${record.reason}`,
      '',
    );
  }

  return lines.join('\n');
}
