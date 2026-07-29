'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Image as ImageIcon, RefreshCw, Save } from 'lucide-react';
import { Badge, Button, EmptyState, Panel, ProgressBar, inputClass } from '@/components/ui';
import { formatDuration } from '@/lib/utils';
import type { YoutubeScene } from '@/types/domain';
import type { MediaAsset, SceneStatus } from '@/types/production';

const STATUS_TONE: Record<SceneStatus, 'neutral' | 'sky' | 'emerald' | 'amber' | 'red'> = {
  planned: 'neutral',
  awaiting_asset: 'amber',
  generating: 'sky',
  ready: 'emerald',
  failed: 'red',
  blocked: 'amber',
  approved: 'emerald',
};

/**
 * Scene-by-scene production editor.
 *
 * Every control here maps to a real action: editing writes to the scene, retry
 * re-runs the Asset Agent for that scene alone, and the preview is the actual
 * stored asset rather than a mock-up.
 */
export function SceneEditor({
  videoId,
  scenes,
  assets,
}: {
  videoId: string;
  scenes: YoutubeScene[];
  assets: MediaAsset[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<YoutubeScene>>>({});

  const assetFor = (id: string | null) => (id ? (assets.find((a) => a.id === id) ?? null) : null);

  const act = async (
    sceneId: string,
    action: 'update' | 'retry' | 'approve',
    patch?: Partial<YoutubeScene>,
  ) => {
    setBusy(`${sceneId}:${action}`);
    setError(null);
    try {
      const response = await fetch(`/api/youtube/videos/${videoId}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: sceneId, action, patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The action failed.');
      if (data.error) throw new Error(data.error);
      setDrafts((current) => {
        const next = { ...current };
        delete next[sceneId];
        return next;
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(null);
    }
  };

  if (scenes.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No scenes planned yet"
          detail="The Visual Director creates these once the script is approved and the narration exists."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      {scenes.map((scene) => {
        const draft = drafts[scene.id] ?? {};
        const dirty = Object.keys(draft).length > 0;
        const asset = assetFor(scene.asset_id);
        const set = (patch: Partial<YoutubeScene>) =>
          setDrafts((current) => ({ ...current, [scene.id]: { ...current[scene.id], ...patch } }));

        return (
          <Panel key={scene.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--color-edge-soft)] px-4 py-2.5">
              <span className="font-mono text-[11px] text-amber-400">
                {String(scene.scene_number).padStart(2, '0')}
              </span>
              <span className="text-[11px] text-[var(--color-ink-faint)]">
                {formatDuration(scene.duration_seconds * 1000)} · from{' '}
                {formatDuration(scene.start_time_estimate * 1000)}
              </span>
              <Badge tone={STATUS_TONE[scene.status]}>{scene.status.replace('_', ' ')}</Badge>
              <Badge>{scene.asset_strategy.replace(/_/g, ' ')}</Badge>
              {asset?.simulated && <Badge tone="amber">Simulated</Badge>}
              <span className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === `${scene.id}:retry`}
                  onClick={() => act(scene.id, 'retry')}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
                {scene.status === 'ready' && (
                  <Button
                    size="sm"
                    variant="success"
                    loading={busy === `${scene.id}:approve`}
                    onClick={() => act(scene.id, 'approve')}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                )}
              </span>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                {asset && asset.status === 'ready' ? (
                  <figure className="overflow-hidden rounded-lg border border-[var(--color-edge)]">
                    {/* The stored asset itself, served through the authenticated route. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${asset.id}`}
                      alt={`Scene ${scene.scene_number} visual`}
                      className="block aspect-video w-full object-cover"
                    />
                    <figcaption className="px-2 py-1.5 text-[10px] text-[var(--color-ink-faint)]">
                      {asset.provider}
                      {asset.simulated ? ' · simulated placeholder' : ''}
                    </figcaption>
                  </figure>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-[var(--color-edge)] text-[11px] text-[var(--color-ink-faint)]">
                    <span className="flex flex-col items-center gap-1.5">
                      <ImageIcon className="h-4 w-4" />
                      {scene.error ? 'Failed' : 'No asset yet'}
                    </span>
                  </div>
                )}
                {scene.error && (
                  <p className="mt-2 text-[11px] leading-snug text-amber-300">{scene.error}</p>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    Narration
                  </span>
                  <textarea
                    value={draft.narration ?? scene.narration}
                    onChange={(event) => set({ narration: event.target.value })}
                    rows={2}
                    className={`${inputClass} resize-y leading-relaxed`}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    {scene.asset_strategy === 'generated_video'
                      ? 'Video prompt'
                      : scene.asset_strategy === 'stock' ||
                          scene.asset_strategy === 'archive_public_source'
                        ? 'Stock search query'
                        : 'Image prompt'}
                  </span>
                  <textarea
                    value={
                      scene.asset_strategy === 'generated_video'
                        ? (draft.video_prompt ?? scene.video_prompt)
                        : scene.asset_strategy === 'stock' ||
                            scene.asset_strategy === 'archive_public_source'
                          ? (draft.b_roll_query ?? scene.b_roll_query)
                          : (draft.image_prompt ?? scene.image_prompt)
                    }
                    onChange={(event) =>
                      set(
                        scene.asset_strategy === 'generated_video'
                          ? { video_prompt: event.target.value }
                          : scene.asset_strategy === 'stock' ||
                              scene.asset_strategy === 'archive_public_source'
                            ? { b_roll_query: event.target.value }
                            : { image_prompt: event.target.value },
                      )
                    }
                    rows={2}
                    className={`${inputClass} resize-y font-mono text-[12px] leading-relaxed`}
                  />
                </label>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                      On-screen text
                    </span>
                    <input
                      value={draft.on_screen_text ?? scene.on_screen_text}
                      onChange={(event) => set({ on_screen_text: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                      Duration (seconds)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={draft.duration_seconds ?? scene.duration_seconds}
                      onChange={(event) => set({ duration_seconds: Number(event.target.value) })}
                      className={inputClass}
                    />
                  </label>
                </div>

                <p className="text-[11px] leading-snug text-[var(--color-ink-muted)]">
                  {scene.visual_direction}
                </p>

                {dirty && (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === `${scene.id}:update`}
                    onClick={() => act(scene.id, 'update', draft)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save scene
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        );
      })}

      <Panel className="p-3">
        <p className="mb-1.5 text-[11px] text-[var(--color-ink-faint)]">
          {scenes.filter((s) => s.asset_id).length} of {scenes.length} scenes have an asset
        </p>
        <ProgressBar
          value={(scenes.filter((s) => s.asset_id).length / scenes.length) * 100}
          colour="#34d399"
          label="Scenes sourced"
        />
      </Panel>
    </div>
  );
}
