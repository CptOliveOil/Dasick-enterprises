import 'server-only';
import { itemFromRecord, readable } from '@/lib/approvals/review';
import { playableUrl } from '@/lib/media/assets';
import { formatDuration } from './script';
import type { DataStore } from '@/lib/db/tables';
import type { DossierBuilder } from './registry';
import type { DossierPart, MediaItem, Panel } from './types';

/**
 * Approvals whose subject is something to look at or listen to.
 *
 * A thumbnail approval that lists concept titles, or a video approval that
 * links to another page, fails the same test the script approval failed: the
 * operator is asked to judge work they have not seen. So the assets are
 * embedded — image, video, audio — alongside the concepts and quality checks
 * that describe them.
 *
 * Assets that exist as rows but not yet as files are shown as exactly that.
 * A broken image and an asset still rendering look identical on screen and mean
 * entirely different things to the person deciding.
 */
export const mediaDossier: DossierBuilder = {
  id: 'media',
  kinds: ['video', 'thumbnail'],

  async build({ store, approval }): Promise<DossierPart | null> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const videoId = typeof payload.video_id === 'string' ? payload.video_id : null;
    if (!videoId) return null;

    const video = await store.get('youtube_videos', videoId).catch(() => null);
    if (!video) return null;

    const panels: Panel[] = [];
    const media: MediaItem[] = [];

    if (approval.kind === 'video' && video.final_asset_id) {
      const item = await mediaItem(store, video.final_asset_id, 'The rendered video');
      if (item) media.push(item);
    }
    if (video.thumbnail_asset_id) {
      const item = await mediaItem(store, video.thumbnail_asset_id, 'The selected thumbnail');
      if (item) media.push(item);
    }
    if (approval.kind === 'video' && video.voiceover_id) {
      const voiceover = await store.get('youtube_voiceovers', video.voiceover_id).catch(() => null);
      if (voiceover?.audio_asset_id) {
        const item = await mediaItem(
          store,
          voiceover.audio_asset_id,
          `Narration — ${voiceover.voice_name}`,
        );
        if (item) media.push(item);
      }
    }

    if (media.length > 0) {
      panels.push({
        kind: 'media',
        id: 'media',
        title: 'The work itself',
        subtitle: 'Play it before you decide.',
        items: media,
      });
    }

    // Thumbnail concepts, whether or not one has been rendered — the reasoning
    // behind a design is part of judging it.
    const concepts = await store
      .list('youtube_thumbnail_concepts', { where: { video_id: video.id }, limit: 12 })
      .catch(() => []);
    if (concepts.length > 0) {
      panels.push({
        kind: 'items',
        id: 'concepts',
        title: 'Thumbnail concepts',
        subtitle: `${concepts.length} direction${concepts.length === 1 ? '' : 's'}, with the reasoning behind each.`,
        items: concepts.map((concept) =>
          itemFromRecord(concept as unknown as Record<string, unknown>, {
            titleKey: 'concept_title',
            subtitleKey: 'visual_description',
            badgeKeys: ['emotion'],
            leadKeys: ['subject', 'composition', 'text', 'click_psychology'],
          }),
        ),
        itemNoun: 'concept',
      });
    }

    const checks = await store
      .list('youtube_quality_checks', { where: { video_id: video.id } })
      .catch(() => []);
    if (checks.length > 0) {
      panels.push({
        kind: 'items',
        id: 'quality',
        title: 'Quality control',
        subtitle: 'What the automated checks found.',
        items: checks.map((check) =>
          itemFromRecord(check as unknown as Record<string, unknown>, {
            titleKey: 'verdict',
            badgeKeys: ['verdict'],
            fallbackTitle: 'Quality check',
          }),
        ),
        itemNoun: 'check',
      });
    }

    panels.push({
      kind: 'ledger',
      id: 'cost',
      title: 'Cost',
      lines: [
        {
          label: 'Spent so far',
          value: `£${video.actual_cost.toFixed(2)}`,
          emphasis: true,
          hint: 'Already gone. Rejecting does not refund it.',
        },
        { label: 'Estimated', value: `£${video.estimated_cost.toFixed(2)}` },
      ],
    });

    if (panels.length === 0) return null;

    return {
      summary: {
        title: video.title,
        subtitle: `Stage: ${video.stage.replace(/_/g, ' ')}`,
        metrics: [
          { label: 'Status', value: video.status.replace(/_/g, ' ') },
          {
            label: 'Blocked',
            value: video.blocked_reason ?? 'No',
            tone: video.blocked_reason ? 'red' : 'emerald',
          },
        ],
      },
      panels,
      href: `/youtube/production/${video.id}`,
      source: 'records',
    };
  },
};

async function mediaItem(
  store: DataStore,
  assetId: string,
  label: string,
): Promise<MediaItem | null> {
  const asset = await store.get('media_assets', assetId).catch(() => null);
  if (!asset) return null;

  const mediaKind = asset.mime_type.startsWith('video')
    ? 'video'
    : asset.mime_type.startsWith('audio')
      ? 'audio'
      : 'image';

  const url = playableUrl(asset);
  return {
    id: asset.id,
    label,
    mediaKind,
    url,
    note:
      url === null
        ? `This asset is recorded as ${asset.status} and has no reachable file yet. There is nothing to play — do not treat its absence as a rendering that failed to load.`
        : asset.provider === 'simulated'
          ? 'Produced by the simulated provider. It is a placeholder, not real output.'
          : null,
    fields: [
      { label: 'Provider', value: asset.provider },
      ...(asset.duration
        ? [{ label: 'Duration', value: formatDuration(asset.duration) }]
        : []),
      ...(asset.width && asset.height
        ? [{ label: 'Size', value: `${asset.width}×${asset.height}` }]
        : []),
      ...(asset.generation_cost > 0
        ? [{ label: 'Cost', value: `£${asset.generation_cost.toFixed(2)}` }]
        : []),
      ...(asset.generation_prompt
        ? [
            {
              label: 'Prompt',
              value: readable(asset.generation_prompt) ?? '',
              long: true,
            },
          ]
        : []),
    ],
  };
}
