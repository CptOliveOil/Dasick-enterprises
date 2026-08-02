import 'server-only';
import { envValue, providerBytes, providerJson, ProviderRequestError } from './http';
import type {
  ProducedMedia,
  ProviderDescriptor,
  StockMediaProvider,
  StockResult,
} from './types';

/**
 * Openverse — openly licensed media, with the licence attached.
 *
 * Chosen over the obvious stock libraries for one reason: **every result
 * carries its licence and its creator in the response**. That is the field the
 * copyright review needs and the field most APIs make you infer. A source that
 * returns an image without saying what you may do with it is not usable here,
 * because the alternative is a pipeline that quietly assumes permission.
 *
 * It aggregates Wikimedia Commons, museum collections, Flickr's CC pool and
 * government archives, which is the material a documentary actually wants.
 *
 * Nothing is scraped. Search results come from the API, files are fetched from
 * the URL the API returns, and anything whose licence requires attribution
 * carries that attribution into the licence report rather than being silently
 * used.
 */

const API = 'https://api.openverse.org/v1';

export const OPENVERSE_ENV = ['STOCK_PROVIDER'] as const;

/**
 * Licences that require crediting the creator.
 *
 * `by`, `by-sa`, `by-nc` and friends all do; `cc0` and `pdm` do not. Getting
 * this wrong in the permissive direction is a licence breach, so anything
 * unrecognised is treated as requiring attribution.
 */
export function requiresAttribution(licence: string): boolean {
  const normalised = licence.trim().toLowerCase();
  return !['cc0', 'pdm', 'public domain'].includes(normalised);
}

/** Licences carrying a no-derivatives or no-commercial term. */
export function restrictsUse(licence: string): { commercial: boolean; derivatives: boolean } {
  const normalised = licence.trim().toLowerCase();
  return {
    commercial: !normalised.includes('nc'),
    derivatives: !normalised.includes('nd'),
  };
}

interface OpenverseItem {
  id: string;
  title?: string | null;
  creator?: string | null;
  creator_url?: string | null;
  url: string;
  thumbnail?: string | null;
  foreign_landing_url?: string | null;
  license: string;
  license_version?: string | null;
  license_url?: string | null;
  provider?: string | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
}

export function openverseConfigured(): boolean {
  return envValue('STOCK_PROVIDER')?.toLowerCase() === 'openverse';
}

export class OpenverseStockProvider implements StockMediaProvider {
  readonly descriptor: ProviderDescriptor = {
    kind: 'stock',
    name: 'Openverse',
    connected: true,
    requiredEnv: [...OPENVERSE_ENV],
    capabilities: ['image_search', 'licence_metadata', 'attribution'],
    pricingNote: 'Free. Openly licensed material — attribution is required for most licences.',
    simulated: false,
  };

  isConnected(): boolean {
    return openverseConfigured();
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const data = await providerJson<{ result_count: number }>(
        `${API}/images/?q=archive&page_size=1`,
        { label: 'Openverse connection test', attempts: 1, timeoutMs: 15_000 },
      );
      return {
        ok: true,
        detail: `Connected. ${data.result_count?.toLocaleString('en-GB') ?? 'Many'} openly licensed images reachable.`,
      };
    } catch (error) {
      return {
        ok: false,
        detail:
          error instanceof ProviderRequestError
            ? `${error.message} ${error.remedy}`
            : 'Could not reach Openverse.',
      };
    }
  }

  async search(query: string, kind: 'image' | 'video'): Promise<StockResult[]> {
    if (kind === 'video') {
      // Openverse indexes audio and images, not video. Returning an empty list
      // rather than pretending lets the visual step fall back to a generated
      // still, which is better than a wrong clip.
      return [];
    }

    const params = new URLSearchParams({
      q: query,
      page_size: '12',
      // Commercially usable and modifiable: this material is cut into a
      // monetised video, so anything else is not actually available to us.
      license_type: 'commercial,modification',
      mature: 'false',
    });

    const data = await providerJson<{ results: OpenverseItem[] }>(
      `${API}/images/?${params.toString()}`,
      { label: 'Openverse search', timeoutMs: 30_000 },
    );

    return (data.results ?? []).map((item) => ({
      id: item.id,
      previewUrl: item.thumbnail ?? item.url,
      description: item.title ?? 'Untitled',
      // Everything the licence report needs, packed into the one field the
      // interface exposes, so no detail is lost between search and use.
      licence: JSON.stringify({
        licence: item.license,
        version: item.license_version ?? null,
        url: item.license_url ?? null,
        creator: item.creator ?? null,
        creator_url: item.creator_url ?? null,
        source: item.source ?? item.provider ?? 'openverse',
        landing_page: item.foreign_landing_url ?? null,
        attribution_required: requiresAttribution(item.license),
      }),
      width: item.width ?? 0,
      height: item.height ?? 0,
      kind: 'image',
    }));
  }

  async fetchAsset(result: StockResult): Promise<ProducedMedia> {
    let licence: Record<string, unknown>;
    try {
      licence = JSON.parse(result.licence) as Record<string, unknown>;
    } catch {
      throw new ProviderRequestError(
        'bad_request',
        null,
        'This result carries no licence information, so it cannot be used.',
        false,
      );
    }

    const url = result.previewUrl;
    const bytes = await providerBytes(url, {
      label: 'Openverse asset download',
      timeoutMs: 60_000,
      headers: { 'User-Agent': 'CommandCentre/1.0 (+https://github.com)' },
    });

    const attribution = licence.creator
      ? `“${result.description}” by ${licence.creator} — ${licence.licence}${
          licence.url ? ` (${licence.url})` : ''
        }`
      : `“${result.description}” — ${licence.licence}`;

    return {
      data: bytes,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: result.width || null,
      height: result.height || null,
      providerAssetId: result.id,
      cost: 0,
      simulated: false,
      metadata: {
        provider: 'openverse',
        // The fields the copyright step classifies on. Every one comes from the
        // API rather than being inferred here.
        provenance: 'licensed_stock',
        licence: licence.licence,
        licence_url: licence.url,
        creator: licence.creator,
        source: licence.source,
        landing_page: licence.landing_page,
        attribution_required: licence.attribution_required,
        attribution,
        search_query: result.description,
      },
    };
  }
}
