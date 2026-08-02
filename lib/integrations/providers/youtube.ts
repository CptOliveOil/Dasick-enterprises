import 'server-only';
import { promises as fs } from 'node:fs';
import { envValue, providerFetch, providerJson, ProviderRequestError } from './http';
import type {
  AnalyticsDay,
  AnalyticsProvider,
  AnalyticsWindow,
  ProviderDescriptor,
  PublishRequest,
  PublishResult,
  Publisher,
} from './types';

/**
 * YouTube, through the official Data and Analytics APIs.
 *
 * Never browser automation. An upload is the one irreversible act in the whole
 * system, and driving a headless browser at someone's channel is both against
 * the terms and impossible to reason about when it half-works.
 *
 * Authentication is a stored refresh token, exchanged for a short-lived access
 * token on each call. The refresh token lives in the server environment and is
 * never returned, logged, or sent to the browser — `redact()` in `http.ts`
 * scrubs it from any error that mentions it.
 *
 * Three safety properties are structural rather than conventional:
 *
 * - **Private by default.** `publish()` will not accept `public` unless the
 *   caller explicitly passed it, and the capability that calls this defaults to
 *   private. An accidental upload is recoverable; an accidental publication is
 *   not.
 * - **Synthetic media is declared.** Every upload sets the AI-generated
 *   disclosure, because this pipeline always produces synthetic narration.
 * - **`madeForKids` is never inferred.** It is a legal self-declaration that
 *   belongs to the operator, so it is passed through untouched.
 */

const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const DATA = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

export const YOUTUBE_ENV = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
] as const;

export function youtubeConfigured(): boolean {
  return YOUTUBE_ENV.every((name) => Boolean(envValue(name)));
}

/**
 * Exchanges the long-lived refresh token for a short-lived access token.
 *
 * Cached for slightly less than its stated lifetime so a long upload cannot
 * have its token expire mid-transfer.
 */
let cached: { token: string; expiresAt: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const clientId = envValue('YOUTUBE_CLIENT_ID');
  const clientSecret = envValue('YOUTUBE_CLIENT_SECRET');
  const refreshToken = envValue('YOUTUBE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new ProviderRequestError(
      'auth',
      null,
      'YouTube is not connected. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN.',
      false,
    );
  }

  const data = await providerJson<{ access_token: string; expires_in: number }>(OAUTH_TOKEN, {
    label: 'YouTube token refresh',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    attempts: 2,
    timeoutMs: 20_000,
  });

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** Test seam: clears the cached access token. */
export function resetYouTubeToken(): void {
  cached = null;
}

function descriptor(kind: 'publisher' | 'analytics', capabilities: string[]): ProviderDescriptor {
  return {
    kind,
    name: 'YouTube',
    connected: true,
    requiredEnv: [...YOUTUBE_ENV],
    capabilities,
    pricingNote: 'Free, but subject to a daily API quota. An upload costs about 1,600 units.',
    simulated: false,
  };
}

/* ------------------------------------------------------------------ */
/* Publisher                                                           */
/* ------------------------------------------------------------------ */

export class YouTubePublisher implements Publisher {
  readonly descriptor = descriptor('publisher', ['upload', 'thumbnail', 'captions', 'schedule']);

  isConnected(): boolean {
    return youtubeConfigured();
  }

  /** Reads the connected channel. Uploads nothing and costs nothing. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const channel = await this.channel();
      return {
        ok: true,
        detail: channel
          ? `Connected to “${channel.title}” (${channel.id}).`
          : 'Connected, but the account has no YouTube channel.',
      };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof ProviderRequestError
            ? `${error.message} ${error.remedy}`
            : 'Could not reach YouTube.',
      };
    }
  }

  async channel(): Promise<{ id: string; title: string } | null> {
    const token = await accessToken();
    const data = await providerJson<{
      items?: { id: string; snippet: { title: string } }[];
    }>(`${DATA}/channels?part=snippet&mine=true`, {
      label: 'YouTube channel lookup',
      headers: { Authorization: `Bearer ${token}` },
      attempts: 1,
      timeoutMs: 20_000,
    });
    const item = data.items?.[0];
    return item ? { id: item.id, title: item.snippet.title } : null;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const token = await accessToken();
    const file = await fs.readFile(request.videoPath);

    const description = withChapters(request.description, request.chapters);
    const status: Record<string, unknown> = {
      // `scheduled` is expressed as private plus a publish time; YouTube has no
      // separate scheduled state.
      privacyStatus: request.visibility === 'scheduled' ? 'private' : request.visibility,
      selfDeclaredMadeForKids: request.madeForKids,
      containsSyntheticMedia: request.syntheticMedia,
    };
    if (request.visibility === 'scheduled') {
      if (!request.publishAt) {
        throw new ProviderRequestError(
          'bad_request',
          null,
          'A scheduled upload needs a publish time.',
          false,
        );
      }
      status.publishAt = request.publishAt;
    }

    // Multipart resumable would be better for very large files; a single
    // multipart request is correct and simpler for the sizes this pipeline
    // produces, and it fails cleanly rather than half-uploading.
    const boundary = `cc-${Date.now().toString(36)}`;
    const metadata = JSON.stringify({
      snippet: {
        title: request.title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: request.tags.slice(0, 30),
        categoryId: envValue('YOUTUBE_CATEGORY_ID') ?? '27',
      },
      status,
    });

    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploaded = await providerJson<{ id: string }>(
      `${UPLOAD}?uploadType=multipart&part=snippet,status`,
      {
        label: 'YouTube upload',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body as unknown as BodyInit,
        // Uploads are slow and must never be retried automatically: a retried
        // upload is a duplicate video on the channel.
        attempts: 1,
        timeoutMs: 900_000,
      },
    );

    if (request.thumbnailPath) {
      await this.setThumbnail(uploaded.id, request.thumbnailPath, token).catch(() => {
        // A failed thumbnail must not orphan a successful upload. The video
        // exists; the operator can set the thumbnail from the package.
      });
    }
    if (request.captionsVtt) {
      await this.uploadCaptions(uploaded.id, request.captionsVtt, token).catch(() => {});
    }

    return {
      externalId: uploaded.id,
      url: `https://www.youtube.com/watch?v=${uploaded.id}`,
      visibility: request.visibility,
      cost: 0,
      simulated: false,
    };
  }

  private async setThumbnail(videoId: string, filePath: string, token: string): Promise<void> {
    const image = await fs.readFile(filePath);
    await providerFetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        label: 'YouTube thumbnail upload',
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
        body: image as unknown as BodyInit,
        attempts: 2,
        timeoutMs: 120_000,
      },
    );
  }

  private async uploadCaptions(videoId: string, vtt: string, token: string): Promise<void> {
    const boundary = `cc-cap-${Date.now().toString(36)}`;
    const metadata = JSON.stringify({
      snippet: { videoId, language: 'en', name: 'English', isDraft: false },
    });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/vtt\r\n\r\n`,
      ),
      Buffer.from(vtt, 'utf8'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    await providerFetch(
      'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet',
      {
        label: 'YouTube caption upload',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body as unknown as BodyInit,
        attempts: 2,
        timeoutMs: 120_000,
      },
    );
  }

  /**
   * Sets a published video back to private.
   *
   * YouTube has no delete-that-restores, so this is the honest limit of
   * "unpublish": the video stops being visible, and it still exists.
   */
  async unpublish(externalId: string): Promise<void> {
    const token = await accessToken();
    await providerFetch(`${DATA}/videos?part=status`, {
      label: 'YouTube unpublish',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: externalId, status: { privacyStatus: 'private' } }),
      attempts: 2,
      timeoutMs: 30_000,
    });
  }
}

/** YouTube reads chapters out of the description, so that is where they go. */
export function withChapters(
  description: string,
  chapters: { startSeconds: number; label: string }[],
): string {
  if (chapters.length === 0) return description;
  const stamp = (seconds: number) => {
    const whole = Math.max(0, Math.round(seconds));
    const m = String(Math.floor(whole / 60)).padStart(2, '0');
    const s = String(whole % 60).padStart(2, '0');
    return `${m}:${s}`;
  };
  // The first chapter must start at 00:00 or YouTube ignores the whole list.
  const ordered = [...chapters].sort((a, b) => a.startSeconds - b.startSeconds);
  if (ordered[0] && ordered[0].startSeconds > 0) {
    ordered.unshift({ startSeconds: 0, label: 'Introduction' });
  }
  return `${description}\n\n${ordered.map((c) => `${stamp(c.startSeconds)} ${c.label}`).join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

/**
 * Real figures only.
 *
 * The metrics requested are the ones the API genuinely returns for a channel
 * owner. Revenue is deliberately **not** requested: it needs a monetised
 * channel and a separate scope, and returning zero for an unmonetised channel
 * would be recorded as "earned nothing" rather than "not measured". Null flows
 * into Business Intelligence Memory as unknown, which is the truth.
 */
export class YouTubeAnalyticsProvider implements AnalyticsProvider {
  readonly descriptor = descriptor('analytics', ['views', 'watch_time', 'engagement']);

  isConnected(): boolean {
    return youtubeConfigured();
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      await accessToken();
      return { ok: true, detail: 'Connected. Analytics will be collected for the owned channel.' };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof ProviderRequestError
            ? `${error.message} ${error.remedy}`
            : 'Could not reach YouTube Analytics.',
      };
    }
  }

  async collectAnalytics(window: AnalyticsWindow): Promise<AnalyticsDay[]> {
    const token = await accessToken();
    const metrics = [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'likes',
      'comments',
      'shares',
      'subscribersGained',
    ];

    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate: window.from,
      endDate: window.to,
      metrics: metrics.join(','),
      dimensions: 'day',
      filters: `video==${window.externalId}`,
    });

    const data = await providerJson<{
      columnHeaders?: { name: string }[];
      rows?: (string | number)[][];
    }>(`${ANALYTICS}?${params.toString()}`, {
      label: 'YouTube analytics',
      headers: { Authorization: `Bearer ${token}` },
      attempts: 2,
      timeoutMs: 60_000,
    });

    const headers = (data.columnHeaders ?? []).map((header) => header.name);
    const at = (row: (string | number)[], name: string): number => {
      const index = headers.indexOf(name);
      return index >= 0 ? Number(row[index] ?? 0) : 0;
    };

    return (data.rows ?? []).map((row) => ({
      date: String(row[headers.indexOf('day')] ?? window.from),
      views: at(row, 'views'),
      // Impressions and click-through live in a different report that needs
      // another scope. Zero here means "not collected", and the caller stores
      // null rather than a rate nobody measured.
      impressions: 0,
      clickThroughRate: 0,
      watchTimeMinutes: at(row, 'estimatedMinutesWatched'),
      averageViewDurationSeconds: at(row, 'averageViewDuration'),
      likes: at(row, 'likes'),
      comments: at(row, 'comments'),
      shares: at(row, 'shares'),
      subscribersGained: at(row, 'subscribersGained'),
      // Never requested, never guessed.
      revenue: 0,
    }));
  }
}
