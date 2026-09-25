import type { FetchedAccount, PlatformFetcher } from './types.js';

/**
 * TikTok et Instagram n'ont pas d'API publique pour lire les stats d'un compte tiers
 * (leurs APIs officielles demandent que chaque clipper connecte son compte en OAuth).
 * On passe donc par des scrapers hébergés sur Apify (payants à l'usage).
 *
 * ⚠️ Les noms d'actors et les champs de sortie ci-dessous sont à vérifier sur la page
 * de chaque actor avant la mise en prod : ils évoluent de temps en temps.
 */
async function runActor<T>(token: string, actorId: string, input: unknown): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export class TikTokApifyFetcher implements PlatformFetcher {
  readonly platform = 'tiktok' as const;

  constructor(
    private readonly token: string,
    private readonly maxVideos: number,
    private readonly actorId = 'clockworks~tiktok-scraper',
  ) {}

  async fetchAccount(account: { handle: string }): Promise<FetchedAccount> {
    const items = await runActor<Record<string, any>>(this.token, this.actorId, {
      profiles: [account.handle],
      resultsPerPage: this.maxVideos,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });
    return {
      displayName: items[0]?.authorMeta?.nickName,
      externalId: items[0]?.authorMeta?.id,
      videos: items
        .filter((i) => i.id)
        .map((i) => ({
          platformVideoId: String(i.id),
          url: i.webVideoUrl,
          thumbnailUrl: i.videoMeta?.coverUrl ?? i.covers?.[0],
          title: i.text,
          publishedAt: i.createTimeISO ? Date.parse(i.createTimeISO) : undefined,
          views: num(i.playCount) ?? 0,
          likes: num(i.diggCount),
          comments: num(i.commentCount),
        })),
    };
  }
}

export class InstagramApifyFetcher implements PlatformFetcher {
  readonly platform = 'instagram' as const;

  constructor(
    private readonly token: string,
    private readonly maxVideos: number,
    private readonly actorId = 'apify~instagram-reel-scraper',
  ) {}

  async fetchAccount(account: { handle: string }): Promise<FetchedAccount> {
    const items = await runActor<Record<string, any>>(this.token, this.actorId, {
      username: [account.handle],
      resultsLimit: this.maxVideos,
    });
    return {
      displayName: items[0]?.ownerFullName,
      externalId: items[0]?.ownerId,
      videos: items
        .filter((i) => i.shortCode || i.id)
        .map((i) => ({
          platformVideoId: String(i.shortCode ?? i.id),
          url: i.url,
          thumbnailUrl: i.displayUrl ?? i.thumbnailUrl,
          title: i.caption,
          publishedAt: i.timestamp ? Date.parse(i.timestamp) : undefined,
          views: num(i.videoPlayCount) ?? num(i.videoViewCount) ?? 0,
          likes: num(i.likesCount),
          comments: num(i.commentsCount),
        })),
    };
  }
}
