import type { FetchedAccount, PlatformFetcher } from './types.js';

const API = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube Data API v3 (clé API gratuite, quota 10 000 unités/jour).
 * Coût par compte : ~3 unités (channels + playlistItems + videos).
 */
export class YouTubeFetcher implements PlatformFetcher {
  readonly platform = 'youtube' as const;

  constructor(
    private readonly apiKey: string,
    private readonly maxVideos: number,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: this.apiKey })) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async fetchAccount(account: { handle: string; externalId: string | null }): Promise<FetchedAccount> {
    const lookup: Record<string, string> = account.externalId
      ? { id: account.externalId }
      : account.handle.startsWith('UC')
        ? { id: account.handle }
        : { forHandle: `@${account.handle}` };

    const channels = await this.get<{
      items?: Array<{ id: string; snippet: { title: string }; contentDetails: { relatedPlaylists: { uploads: string } } }>;
    }>('channels', { part: 'snippet,contentDetails', ...lookup });
    const channel = channels.items?.[0];
    if (!channel) throw new Error(`Chaîne YouTube introuvable : ${account.handle}`);

    const playlist = await this.get<{ items?: Array<{ contentDetails: { videoId: string } }> }>('playlistItems', {
      part: 'contentDetails',
      playlistId: channel.contentDetails.relatedPlaylists.uploads,
      maxResults: String(Math.min(this.maxVideos, 50)),
    });
    const ids = (playlist.items ?? []).map((i) => i.contentDetails.videoId);
    if (ids.length === 0) return { externalId: channel.id, displayName: channel.snippet.title, videos: [] };

    const videos = await this.get<{
      items?: Array<{
        id: string;
        snippet: { title: string; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    }>('videos', { part: 'snippet,statistics', id: ids.join(',') });

    return {
      externalId: channel.id,
      displayName: channel.snippet.title,
      videos: (videos.items ?? []).map((v) => ({
        platformVideoId: v.id,
        url: `https://www.youtube.com/shorts/${v.id}`,
        title: v.snippet.title,
        publishedAt: Date.parse(v.snippet.publishedAt),
        views: Number(v.statistics.viewCount ?? 0),
        likes: v.statistics.likeCount ? Number(v.statistics.likeCount) : undefined,
        comments: v.statistics.commentCount ? Number(v.statistics.commentCount) : undefined,
      })),
    };
  }
}
