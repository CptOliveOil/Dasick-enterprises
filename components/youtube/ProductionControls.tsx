'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, Play, RefreshCw, Wand2 } from 'lucide-react';
import { Button, Panel, inputClass } from '@/components/ui';
import type { MediaAsset } from '@/types/production';

const ACTIONS = [
  { key: 'regenerate_voiceover', label: 'Regenerate narration' },
  { key: 'replan_visuals', label: 'Re-plan visuals' },
  { key: 'source_assets', label: 'Source outstanding assets' },
  { key: 'regenerate_thumbnails', label: 'New thumbnail concepts' },
  { key: 'render_thumbnails', label: 'Render thumbnails' },
  { key: 'rewrite_metadata', label: 'Rewrite metadata' },
  { key: 'reassemble', label: 'Re-assemble video' },
  { key: 'quality_check', label: 'Re-run quality check' },
] as const;

/** Operator control over a video in production. Every button runs a real step. */
export function ProductionControls({
  videoId,
  blockedReason,
  thumbnails,
  selectedThumbnailId,
}: {
  videoId: string;
  blockedReason: string | null;
  thumbnails: MediaAsset[];
  selectedThumbnailId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');

  const run = async (action: string) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/youtube/videos/${videoId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instructions: instructions.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The action failed.');
      if (data.error) throw new Error(data.error);
      if (data.run?.blocked) setError(data.run.blocked);
      else setNotice(data.run?.summary ? `Done — ${data.run.summary}` : 'Done.');
      setInstructions('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(null);
    }
  };

  const selectThumbnail = async (assetId: string) => {
    setBusy(`thumb:${assetId}`);
    setError(null);
    try {
      const response = await fetch(`/api/youtube/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail_asset_id: assetId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not select that thumbnail.');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not select that thumbnail.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {blockedReason && (
        <Panel className="border-amber-500/30 bg-amber-500/[0.07] p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            Blocked
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-100/85">{blockedReason}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2.5"
            loading={busy === 'unblock'}
            onClick={() => run('unblock')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Clear and continue
          </Button>
        </Panel>
      )}

      {thumbnails.length > 0 && (
        <Panel className="p-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            Thumbnail candidates
          </p>
          <div className="grid grid-cols-2 gap-2">
            {thumbnails.map((asset) => {
              const selected = asset.id === selectedThumbnailId;
              return (
                <button
                  key={asset.id}
                  onClick={() => selectThumbnail(asset.id)}
                  disabled={busy !== null}
                  aria-pressed={selected}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    selected
                      ? 'border-amber-400 ring-1 ring-amber-400/40'
                      : 'border-[var(--color-edge)] hover:border-white/25'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${asset.id}`}
                    alt={String(asset.metadata.concept_title ?? 'Thumbnail candidate')}
                    className="block aspect-video w-full object-cover"
                  />
                  <span className="flex items-center gap-1.5 px-2 py-1.5 text-left text-[10px] text-[var(--color-ink-muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {String(asset.metadata.concept_title ?? 'Candidate')}
                    </span>
                    {asset.simulated && <span className="shrink-0 text-amber-300">SIM</span>}
                    {selected && <span className="shrink-0 text-amber-300">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
            Selecting a thumbnail is your decision — no agent picks one.
          </p>
        </Panel>
      )}

      <Panel className="p-3.5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Production actions
        </p>
        <input
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Optional instruction, e.g. make the thumbnail bolder"
          className={`${inputClass} mb-2.5`}
        />
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant="secondary"
              loading={busy === action.key}
              onClick={() => run(action.key)}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          ))}
        </div>

        {error && (
          <p className="mt-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
            {notice}
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Plays the rendered video, and says plainly when it is built from placeholders. */
export function VideoPreview({
  asset,
  containsSimulated,
}: {
  asset: MediaAsset | null;
  containsSimulated: boolean;
}) {
  if (!asset || asset.status !== 'ready') {
    return (
      <Panel className="flex aspect-video items-center justify-center p-4 text-center">
        <span className="text-[13px] text-[var(--color-ink-muted)]">
          <Play className="mx-auto mb-2 h-5 w-5 opacity-50" />
          No rendered video yet.
        </span>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        controls
        preload="metadata"
        className="block aspect-video w-full bg-black"
        src={`/api/media/${asset.id}`}
      />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-[var(--color-ink-faint)]">
        <span>
          {asset.width}×{asset.height}
          {asset.duration ? ` · ${Math.round(asset.duration)}s` : ''}
          {asset.file_size ? ` · ${(asset.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
        </span>
        {containsSimulated && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-semibold uppercase tracking-[0.1em] text-amber-300">
            Contains simulated assets
          </span>
        )}
        <a
          href={`/api/media/${asset.id}?download=1`}
          className="ml-auto flex items-center gap-1 text-amber-400 underline-offset-4 hover:underline"
        >
          <Download className="h-3 w-3" />
          Download
        </a>
      </div>
    </Panel>
  );
}
