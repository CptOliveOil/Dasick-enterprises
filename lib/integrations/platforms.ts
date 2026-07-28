import { config } from '@/lib/config';

/**
 * Platform data providers. Nothing in the application reads a live platform
 * API directly — everything goes through these interfaces so the connected and
 * unconnected cases are handled in exactly one place.
 */

export interface YoutubeVideoStats {
  externalId: string;
  title: string;
  views: number;
  impressions: number;
  ctr: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  revenue: number;
  publishedAt: string;
}

export interface YoutubeProvider {
  readonly connected: boolean;
  listRecentVideos(channelExternalId: string): Promise<YoutubeVideoStats[]>;
}

export interface EtsyListingStats {
  externalId: string;
  title: string;
  views: number;
  favourites: number;
  orders: number;
  revenue: number;
}

export interface EtsyProvider {
  readonly connected: boolean;
  listListings(shopExternalId: string): Promise<EtsyListingStats[]>;
  /** Publishing is gated on an approval before this is ever reached. */
  publishListing(shopExternalId: string, listingId: string): Promise<{ url: string }>;
}

class UnconnectedYoutube implements YoutubeProvider {
  readonly connected = false;
  async listRecentVideos(): Promise<YoutubeVideoStats[]> {
    throw new Error('YouTube is not connected. Set YOUTUBE_API_KEY to pull live analytics.');
  }
}

class UnconnectedEtsy implements EtsyProvider {
  readonly connected = false;
  async listListings(): Promise<EtsyListingStats[]> {
    throw new Error('Etsy is not connected. Set ETSY_API_KEY to pull live shop data.');
  }
  async publishListing(): Promise<{ url: string }> {
    throw new Error('Etsy is not connected, so nothing can be published.');
  }
}

export function getYoutubeProvider(): YoutubeProvider {
  if (!config.youtube.apiKey) return new UnconnectedYoutube();
  throw new Error(
    'YOUTUBE_API_KEY is set but no YouTube adapter is registered. Add one in lib/integrations/platforms.ts.',
  );
}

export function getEtsyProvider(): EtsyProvider {
  if (!config.etsy.apiKey) return new UnconnectedEtsy();
  throw new Error(
    'ETSY_API_KEY is set but no Etsy adapter is registered. Add one in lib/integrations/platforms.ts.',
  );
}
