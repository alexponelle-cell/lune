import type { Config } from '../config.js';
import type { Platform } from '../domain/links.js';
import { InstagramApifyFetcher, TikTokApifyFetcher } from './apify.js';
import { MockFetcher } from './mock.js';
import type { FetcherRegistry, PlatformFetcher } from './types.js';
import { YouTubeFetcher } from './youtube.js';

class MissingCredentials implements PlatformFetcher {
  constructor(
    readonly platform: Platform,
    private readonly envVar: string,
  ) {}
  async fetchAccount(): Promise<never> {
    throw new Error(`${this.envVar} manquant : impossible de récupérer les stats ${this.platform}`);
  }
}

export function createFetchers(config: Config): FetcherRegistry {
  const n = config.VIDEOS_PER_ACCOUNT;
  if (config.FETCHER_MODE === 'mock') {
    return {
      tiktok: new MockFetcher('tiktok', n),
      instagram: new MockFetcher('instagram', n),
      youtube: new MockFetcher('youtube', n),
    };
  }
  return {
    youtube: config.YOUTUBE_API_KEY
      ? new YouTubeFetcher(config.YOUTUBE_API_KEY, n)
      : new MissingCredentials('youtube', 'YOUTUBE_API_KEY'),
    tiktok: config.APIFY_TOKEN ? new TikTokApifyFetcher(config.APIFY_TOKEN, n) : new MissingCredentials('tiktok', 'APIFY_TOKEN'),
    instagram: config.APIFY_TOKEN
      ? new InstagramApifyFetcher(config.APIFY_TOKEN, n)
      : new MissingCredentials('instagram', 'APIFY_TOKEN'),
  };
}
