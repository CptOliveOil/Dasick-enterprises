import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import {
  ffmpegAvailable,
  probeMedia,
  renderPlaceholderImage,
  renderSilentAudio,
} from '@/lib/media/ffmpeg';
import { FfmpegRenderer } from '@/lib/integrations/providers/ffmpeg-renderer';

/**
 * A real render, end to end, using only local ffmpeg.
 *
 * Opt-in: set `RENDER_SMOKE=1`. It is skipped by default because it depends on
 * a working ffmpeg build and takes real seconds, and a suite that sometimes
 * fails for environmental reasons stops being believed. It calls no paid
 * provider and needs no credentials.
 *
 *   RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
 */
const enabled = process.env.RENDER_SMOKE === '1' && ffmpegAvailable();

describe.skipIf(!enabled)('a real local render', () => {
  it('produces a playable MP4 whose duration matches the audio', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-smoke-'));
    try {
      // Fixtures: two stills and eight seconds of narration.
      const images = await Promise.all(
        [0, 1].map(async (index) => {
          const file = path.join(dir, `scene-${index}.png`);
          await renderPlaceholderImage({
            outputPath: file,
            width: 1920,
            height: 1080,
            background: index === 0 ? '#101a2e' : '#2e1810',
            lines: [{ text: `Scene ${index + 1}`, size: 72 }],
          });
          return file;
        }),
      );
      const narration = path.join(dir, 'narration.m4a');
      await renderSilentAudio(8, narration);

      const output = path.join(dir, 'out.mp4');
      await new FfmpegRenderer().renderTimeline({
        jobId: 'smoke',
        preset: 'draft',
        width: 1920,
        height: 1080,
        fps: 30,
        clips: images.map((filePath, index) => ({
          filePath,
          kind: 'image' as const,
          durationSeconds: 4,
          animation: index === 0 ? ('zoom_in' as const) : ('none' as const),
          transition: index === 0 ? 'cut' : 'fade',
        })),
        narrationPath: narration,
        musicPath: null,
        musicVolume: 0.1,
        musicFadeIn: 0,
        musicFadeOut: 0,
        assPath: null,
        outputPath: output,
      });

      const probe = await probeMedia(output);
      expect(probe.durationSeconds).toBeGreaterThan(6);
      expect(probe.durationSeconds).toBeLessThan(10);
      expect(probe.width).toBe(1920);
      expect(probe.height).toBe(1080);
      expect(probe.hasAudioTrack).toBe(true);
      expect(probe.hasVideoTrack).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
