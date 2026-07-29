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

export interface YoutubeChannelInfo {
  id: string;
  title: string;
  handle: string;
  subscriberCount: number | null;
  permissions: string[];
  lastSyncedAt: string | null;
}

export interface UploadRequest {
  channelExternalId: string;
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  /** Uploads land as private until the operator or a schedule says otherwise. */
  privacyStatus: 'private' | 'unlisted' | 'public';
  publishAt?: string;
}

/**
 * YouTube integration.
 *
 * Uploads use the official Data API only — never browser automation — and every
 * method is gated behind a genuine connection.
 */
export interface YoutubeProvider {
  readonly connected: boolean;
  getChannel(channelExternalId: string): Promise<YoutubeChannelInfo>;
  listRecentVideos(channelExternalId: string): Promise<YoutubeVideoStats[]>;
  uploadVideo(request: UploadRequest): Promise<{ videoId: string; url: string }>;
  uploadThumbnail(videoId: string, filePath: string): Promise<void>;
  setMetadata(
    videoId: string,
    metadata: { title: string; description: string; tags: string[] },
  ): Promise<void>;
  uploadCaptions(videoId: string, filePath: string, language: string): Promise<void>;
  schedulePublish(videoId: string, publishAt: string): Promise<void>;
  getUploadStatus(videoId: string): Promise<{ status: string; progress: number }>;
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

/**
 * Every method refuses. Nothing is ever reported as uploaded, scheduled or
 * published when there is no connection behind it.
 */
class UnconnectedYoutube implements YoutubeProvider {
  readonly connected = false;

  private refuse(action: string): never {
    throw new Error(
      `YouTube is not connected, so ${action} is not possible. Set YOUTUBE_API_KEY and register an adapter in lib/integrations/platforms.ts.`,
    );
  }

  async getChannel(): Promise<YoutubeChannelInfo> {
    return this.refuse('reading the channel');
  }
  async listRecentVideos(): Promise<YoutubeVideoStats[]> {
    return this.refuse('pulling analytics');
  }
  async uploadVideo(): Promise<{ videoId: string; url: string }> {
    return this.refuse('uploading');
  }
  async uploadThumbnail(): Promise<void> {
    return this.refuse('uploading a thumbnail');
  }
  async setMetadata(): Promise<void> {
    return this.refuse('setting metadata');
  }
  async uploadCaptions(): Promise<void> {
    return this.refuse('uploading captions');
  }
  async schedulePublish(): Promise<void> {
    return this.refuse('scheduling');
  }
  async getUploadStatus(): Promise<{ status: string; progress: number }> {
    return this.refuse('checking upload status');
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
