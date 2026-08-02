import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderRequestError, redact } from '@/lib/integrations/providers/http';
import { ElevenLabsVoiceProvider } from '@/lib/integrations/providers/elevenlabs';
import { OpenAiImageProvider, nearestSize } from '@/lib/integrations/providers/openai-images';
import {
  OpenverseStockProvider,
  requiresAttribution,
  restrictsUse,
} from '@/lib/integrations/providers/openverse';
import {
  YouTubeAnalyticsProvider,
  YouTubePublisher,
  resetYouTubeToken,
  withChapters,
} from '@/lib/integrations/providers/youtube';

/**
 * The real provider adapters, against mocked HTTP.
 *
 * Two rules govern this file. **No test may spend money** — every network call
 * is intercepted, and a test that reached a real provider would be a test that
 * charged the person running it. And **no test may pass while a secret leaks**:
 * the adapters read keys from the environment, and those keys end up in error
 * messages, `task.error`, activity logs and the operator's screen unless
 * something actively stops them.
 */

const KEY = 'sk-test-abcdefghijklmnopqrstuvwxyz0123456789';

let fetchMock: ReturnType<typeof vi.fn>;

function respondJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function respondBytes(bytes: Buffer, status = 200) {
  return new Response(new Uint8Array(bytes), { status });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  resetYouTubeToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ */

describe('the shared HTTP layer', () => {
  it('removes anything key-shaped from a message', () => {
    expect(redact(`request failed with key ${KEY}`)).not.toContain(KEY);
    expect(redact('{"api_key": "abcd1234efgh"}')).toContain('[redacted]');
    expect(redact('Authorization: Bearer ya29.averylongaccesstokenvaluehere1234'))
      .not.toContain('ya29.averylongaccesstokenvaluehere1234');
    // Ordinary words survive, so messages stay readable.
    expect(redact('the request was rejected')).toBe('the request was rejected');
  });

  it('categorises failures so each one has a different remedy', () => {
    const cases: [number, string, string][] = [
      [401, 'auth', 'key'],
      [429, 'rate_limit', 'rate limiting'],
      [402, 'quota', 'credit'],
      [500, 'server', 'internal error'],
    ];
    for (const [status, failure, remedyFragment] of cases) {
      const error = new ProviderRequestError(failure as never, status, 'x', false);
      expect(error.failure).toBe(failure);
      expect(error.remedy.toLowerCase()).toContain(remedyFragment);
    }
  });

  it('never retries a request the provider refused outright', async () => {
    vi.stubEnv('VOICE_PROVIDER', 'elevenlabs');
    vi.stubEnv('VOICE_PROVIDER_API_KEY', KEY);
    fetchMock.mockResolvedValue(respondJson({ detail: 'bad voice' }, 400));

    await expect(
      new ElevenLabsVoiceProvider().generateSpeech({
        text: 'hello',
        voiceId: 'v1',
        speed: 1,
        language: 'en',
        settings: {},
      }),
    ).rejects.toThrow();
    // Retrying a 400 pays twice for the same refusal.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */

describe('ElevenLabs narration', () => {
  beforeEach(() => {
    vi.stubEnv('VOICE_PROVIDER', 'elevenlabs');
    vi.stubEnv('VOICE_PROVIDER_API_KEY', KEY);
  });

  it('reports itself connected only when both variables are set', () => {
    expect(new ElevenLabsVoiceProvider().isConnected()).toBe(true);
    vi.stubEnv('VOICE_PROVIDER_API_KEY', '');
    expect(new ElevenLabsVoiceProvider().isConnected()).toBe(false);
  });

  it('tests the connection without synthesising anything', async () => {
    fetchMock.mockResolvedValue(
      respondJson({ tier: 'creator', character_count: 1000, character_limit: 100_000 }),
    );
    const result = await new ElevenLabsVoiceProvider().testConnection();

    expect(result.ok).toBe(true);
    expect(result.detail).toContain('creator');
    // Opening Settings must never spend. The only call is the free one.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/user/subscription');
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('text-to-speech');
  });

  it('sends the key as a header and never in the URL', async () => {
    fetchMock.mockResolvedValue(respondBytes(Buffer.from('ID3fake-audio')));
    await new ElevenLabsVoiceProvider().generateSpeech({
      text: 'Some narration.',
      voiceId: 'voice-123',
      speed: 1,
      language: 'en',
      settings: {},
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain(KEY);
    expect((init as RequestInit).headers).toMatchObject({ 'xi-api-key': KEY });
  });

  it('returns audio, a measured duration and a real cost', async () => {
    fetchMock.mockResolvedValue(respondBytes(Buffer.from('ID3fake-audio')));
    const media = await new ElevenLabsVoiceProvider().generateSpeech({
      text: 'a'.repeat(1000),
      voiceId: 'voice-123',
      speed: 1,
      language: 'en',
      settings: {},
    });

    expect(media.simulated).toBe(false);
    expect(media.extension).toBe('mp3');
    expect(media.data.length).toBeGreaterThan(0);
    expect(media.cost).toBeGreaterThan(0);
    expect(media.metadata).toMatchObject({ provider: 'elevenlabs', voice_id: 'voice-123' });
    // The key must not ride along on the asset record.
    expect(JSON.stringify(media.metadata)).not.toContain(KEY);
  });

  it('never leaks the key through an error message', async () => {
    fetchMock.mockResolvedValue(
      respondJson({ detail: `invalid api key ${KEY}` }, 401),
    );
    const error = (await new ElevenLabsVoiceProvider()
      .generateSpeech({ text: 'x', voiceId: 'v', speed: 1, language: 'en', settings: {} })
      .then(() => null)
      .catch((caught) => caught)) as ProviderRequestError;

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.message).not.toContain(KEY);
    expect(error.failure).toBe('auth');
  });

  it('refuses to synthesise without a voice', async () => {
    await expect(
      new ElevenLabsVoiceProvider().generateSpeech({
        text: 'x',
        voiceId: '',
        speed: 1,
        language: 'en',
        settings: {},
      }),
    ).rejects.toThrow(/no voice was chosen/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */

describe('OpenAI images', () => {
  beforeEach(() => {
    vi.stubEnv('IMAGE_PROVIDER', 'openai');
    vi.stubEnv('IMAGE_PROVIDER_API_KEY', KEY);
  });

  it('maps an aspect ratio to the nearest supported size', () => {
    expect(nearestSize(1920, 1080)).toBe('1536x1024');
    expect(nearestSize(1280, 720)).toBe('1536x1024');
    expect(nearestSize(1024, 1024)).toBe('1024x1024');
    expect(nearestSize(1080, 1920)).toBe('1024x1536');
  });

  it('keeps scene stills and thumbnails as separate use cases', async () => {
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () =>
      respondJson({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }),
    );
    const provider = new OpenAiImageProvider();

    const scene = await provider.generateImage({
      prompt: 'a quiet archive room',
      width: 1920,
      height: 1080,
      purpose: 'scene',
    });
    const thumbnail = await provider.generateImage({
      prompt: 'a bold close-up',
      width: 1920,
      height: 1080,
      purpose: 'thumbnail',
    });

    expect(thumbnail.cost).toBeGreaterThan(scene.cost);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).quality).toBe('medium');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).quality).toBe('high');
    expect(scene.metadata).toMatchObject({ provenance: 'generated_original' });
  });

  it('tests the connection without generating an image', async () => {
    fetchMock.mockResolvedValue(respondJson({ data: [] }));
    await new OpenAiImageProvider().testConnection();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/models');
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('generations');
  });

  it('fails rather than substituting a placeholder when the prompt is refused', async () => {
    fetchMock.mockResolvedValue(respondJson({ data: [] }));
    const error = (await new OpenAiImageProvider()
      .generateImage({ prompt: 'x', width: 1920, height: 1080 })
      .then(() => null)
      .catch((caught) => caught)) as ProviderRequestError;

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.failure).toBe('moderation');
  });
});

/* ------------------------------------------------------------------ */

describe('Openverse stock', () => {
  beforeEach(() => vi.stubEnv('STOCK_PROVIDER', 'openverse'));

  it('knows which licences need a credit', () => {
    expect(requiresAttribution('cc0')).toBe(false);
    expect(requiresAttribution('pdm')).toBe(false);
    expect(requiresAttribution('by')).toBe(true);
    expect(requiresAttribution('by-sa')).toBe(true);
    // Anything unrecognised is treated as needing attribution: guessing
    // permissively is a licence breach, guessing strictly is a credit line.
    expect(requiresAttribution('something-new')).toBe(true);
  });

  it('reads the restrictions out of a licence code', () => {
    expect(restrictsUse('by')).toEqual({ commercial: true, derivatives: true });
    expect(restrictsUse('by-nc')).toEqual({ commercial: false, derivatives: true });
    expect(restrictsUse('by-nd')).toEqual({ commercial: true, derivatives: false });
  });

  it('asks only for material that is commercially usable and modifiable', async () => {
    fetchMock.mockResolvedValue(respondJson({ results: [] }));
    await new OpenverseStockProvider().search('archive footage', 'image');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('license_type=commercial%2Cmodification');
    expect(url).toContain('mature=false');
  });

  it('carries creator, licence and source through to the asset', async () => {
    fetchMock.mockResolvedValueOnce(
      respondJson({
        results: [
          {
            id: 'ov-1',
            title: 'A museum hall',
            creator: 'A. Photographer',
            url: 'https://example.org/full.jpg',
            thumbnail: 'https://example.org/thumb.jpg',
            license: 'by-sa',
            license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
            source: 'wikimedia',
            foreign_landing_url: 'https://example.org/page',
            width: 1600,
            height: 900,
          },
        ],
      }),
    );
    const provider = new OpenverseStockProvider();
    const [result] = await provider.search('museum', 'image');

    fetchMock.mockResolvedValueOnce(respondBytes(Buffer.from('jpegbytes')));
    const media = await provider.fetchAsset(result!);

    expect(media.simulated).toBe(false);
    expect(media.providerAssetId).toBe('ov-1');
    expect(media.metadata).toMatchObject({
      provenance: 'licensed_stock',
      licence: 'by-sa',
      creator: 'A. Photographer',
      source: 'wikimedia',
      attribution_required: true,
    });
    // The line that must reach the licence report.
    expect(String(media.metadata!.attribution)).toContain('A. Photographer');
  });

  it('returns nothing for video rather than pretending', async () => {
    expect(await new OpenverseStockProvider().search('anything', 'video')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an asset that arrived without licence information', async () => {
    await expect(
      new OpenverseStockProvider().fetchAsset({
        id: 'x',
        previewUrl: 'https://example.org/a.jpg',
        description: 'x',
        licence: 'not json',
        width: 0,
        height: 0,
        kind: 'image',
      }),
    ).rejects.toThrow(/no licence information/i);
  });
});

/* ------------------------------------------------------------------ */

describe('YouTube publishing', () => {
  beforeEach(() => {
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'client-id');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'client-secret-value-abcdefgh');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', '1//refresh-token-value-abcdefghijkl');
  });

  it('is connected only when all three variables are present', () => {
    expect(new YouTubePublisher().isConnected()).toBe(true);
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', '');
    expect(new YouTubePublisher().isConnected()).toBe(false);
  });

  it('exchanges the refresh token and sends it in a body, never a URL', async () => {
    fetchMock
      .mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(respondJson({ items: [{ id: 'UC1', snippet: { title: 'My channel' } }] }));

    const result = await new YouTubePublisher().testConnection();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('My channel');

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(String(tokenUrl)).not.toContain('refresh-token-value');
    expect(String((tokenInit as RequestInit).body)).toContain('grant_type=refresh_token');
  });

  it('builds chapters into the description, starting at zero', () => {
    const description = withChapters('A documentary.', [
      { startSeconds: 90, label: 'The middle' },
      { startSeconds: 300, label: 'The end' },
    ]);
    // YouTube ignores the whole list unless the first stamp is 00:00.
    expect(description).toContain('00:00 Introduction');
    expect(description).toContain('01:30 The middle');
    expect(description).toContain('05:00 The end');
  });

  it('leaves a description without chapters untouched', () => {
    expect(withChapters('Just text.', [])).toBe('Just text.');
  });

  it('refuses a scheduled upload with no publish time', async () => {
    fetchMock.mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }));
    await expect(
      new YouTubePublisher().publish({
        videoPath: '/nonexistent',
        thumbnailPath: null,
        captionsVtt: null,
        title: 't',
        description: '',
        tags: [],
        chapters: [],
        visibility: 'scheduled',
        publishAt: null,
        madeForKids: false,
        syntheticMedia: true,
      }),
    ).rejects.toThrow();
  });

  it('declares synthetic media and never infers the kids setting', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-pub-'));
    const file = path.join(dir, 'video.mp4');
    await fs.writeFile(file, Buffer.from('fake mp4'));

    fetchMock
      .mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(respondJson({ id: 'yt-abc123' }));

    const result = await new YouTubePublisher().publish({
      videoPath: file,
      thumbnailPath: null,
      captionsVtt: null,
      title: 'A documentary',
      description: 'Body',
      tags: ['pokemon'],
      chapters: [],
      visibility: 'private',
      publishAt: null,
      madeForKids: false,
      syntheticMedia: true,
    });

    expect(result.simulated).toBe(false);
    expect(result.externalId).toBe('yt-abc123');
    expect(result.url).toContain('yt-abc123');

    const body = String(fetchMock.mock.calls[1]![1]!.body);
    expect(body).toContain('"privacyStatus":"private"');
    expect(body).toContain('"containsSyntheticMedia":true');
    expect(body).toContain('"selfDeclaredMadeForKids":false');

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('never retries an upload automatically', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-pub2-'));
    const file = path.join(dir, 'video.mp4');
    await fs.writeFile(file, Buffer.from('fake mp4'));

    fetchMock
      .mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValue(respondJson({ error: 'server' }, 500));

    await expect(
      new YouTubePublisher().publish({
        videoPath: file,
        thumbnailPath: null,
        captionsVtt: null,
        title: 't',
        description: '',
        tags: [],
        chapters: [],
        visibility: 'private',
        publishAt: null,
        madeForKids: false,
        syntheticMedia: true,
      }),
    ).rejects.toThrow();

    // Token + exactly one upload attempt. A retried upload is a duplicate video.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

/* ------------------------------------------------------------------ */

describe('YouTube analytics', () => {
  beforeEach(() => {
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'client-id');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'client-secret-value-abcdefgh');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', '1//refresh-token-value-abcdefghijkl');
  });

  it('reads only the metrics the API genuinely returns', async () => {
    fetchMock
      .mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(
        respondJson({
          columnHeaders: [
            { name: 'day' },
            { name: 'views' },
            { name: 'estimatedMinutesWatched' },
            { name: 'averageViewDuration' },
            { name: 'likes' },
            { name: 'comments' },
            { name: 'shares' },
            { name: 'subscribersGained' },
          ],
          rows: [['2026-02-01', 1200, 3400, 170, 88, 12, 4, 9]],
        }),
      );

    const [day] = await new YouTubeAnalyticsProvider().collectAnalytics({
      externalId: 'yt-abc123',
      from: '2026-02-01',
      to: '2026-02-28',
    });

    expect(day).toMatchObject({
      date: '2026-02-01',
      views: 1200,
      watchTimeMinutes: 3400,
      averageViewDurationSeconds: 170,
      likes: 88,
      subscribersGained: 9,
    });
    // Never requested, so never claimed. These become null in memory rather
    // than being recorded as "earned nothing" or "nobody clicked".
    expect(day!.revenue).toBe(0);
    expect(day!.impressions).toBe(0);

    const url = String(fetchMock.mock.calls[1]![0]);
    expect(url).not.toContain('estimatedRevenue');
    expect(url).toContain('filters=video%3D%3Dyt-abc123');
  });

  it('returns an empty window rather than inventing rows', async () => {
    fetchMock
      .mockResolvedValueOnce(respondJson({ access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(respondJson({ columnHeaders: [], rows: [] }));

    expect(
      await new YouTubeAnalyticsProvider().collectAnalytics({
        externalId: 'x',
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe('the registry never spends in Demo Mode', () => {
  it('hands back simulated providers even when real credentials are present', async () => {
    vi.resetModules();
    // No database — so this is a demo — but every real credential is set.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VOICE_PROVIDER', 'elevenlabs');
    vi.stubEnv('VOICE_PROVIDER_API_KEY', KEY);
    vi.stubEnv('IMAGE_PROVIDER', 'openai');
    vi.stubEnv('IMAGE_PROVIDER_API_KEY', KEY);
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'a');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'b');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', 'c');

    const registry = await import('@/lib/integrations/providers/registry');
    // Demo Mode is defined as "nothing can be spent". Checking credentials
    // before the mode would quietly bill someone for running the demo.
    expect(registry.getVoiceProvider().descriptor.simulated).toBe(true);
    expect(registry.getImageProvider().descriptor.simulated).toBe(true);
    expect(registry.getPublisher().descriptor.simulated).toBe(true);
    expect(registry.getAnalyticsProvider().descriptor.simulated).toBe(true);
    vi.resetModules();
  });

  it('uses the real adapters once the workspace is real', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('VOICE_PROVIDER', 'elevenlabs');
    vi.stubEnv('VOICE_PROVIDER_API_KEY', KEY);
    vi.stubEnv('STOCK_PROVIDER', 'openverse');
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'a');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'b');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', 'c');

    const registry = await import('@/lib/integrations/providers/registry');
    expect(registry.getVoiceProvider().descriptor.name).toBe('ElevenLabs');
    expect(registry.getStockProvider().descriptor.name).toBe('Openverse');
    expect(registry.getPublisher().descriptor.name).toBe('YouTube');
    // Unconfigured ones stay honestly unconnected rather than simulating.
    expect(registry.getImageProvider().descriptor.connected).toBe(false);
    vi.resetModules();
  });

  it('exposes no key through any descriptor', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('VOICE_PROVIDER', 'elevenlabs');
    vi.stubEnv('VOICE_PROVIDER_API_KEY', KEY);

    const registry = await import('@/lib/integrations/providers/registry');
    // Descriptors are sent to the browser for the settings page. They may name
    // the variables required; they may never carry a value.
    const serialised = JSON.stringify(registry.describeMediaProviders());
    expect(serialised).not.toContain(KEY);
    expect(serialised).toContain('VOICE_PROVIDER_API_KEY');
    vi.resetModules();
  });
});
