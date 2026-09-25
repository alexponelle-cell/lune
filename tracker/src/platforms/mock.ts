import type { Platform } from '../domain/links.js';
import { DAY } from '../domain/stats.js';
import type { FetchedAccount, PlatformFetcher } from './types.js';

/** Hash déterministe pour que chaque handle ait un "profil" stable. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Fausse plateforme pour le dev : chaque compte poste régulièrement et ses vidéos prennent
 * des vues selon une courbe réaliste (forte croissance les premiers jours puis plateau).
 * Les résultats ne dépendent que du handle et de l'heure → rejouable.
 */
export class MockFetcher implements PlatformFetcher {
  constructor(
    readonly platform: Platform,
    private readonly maxVideos: number,
    private readonly clock: () => number = Date.now,
  ) {}

  async fetchAccount(account: { handle: string }): Promise<FetchedAccount> {
    return mockAccount(this.platform, account.handle, this.clock(), this.maxVideos);
  }
}

export function mockAccount(platform: Platform, handle: string, now: number, maxVideos = 30): FetchedAccount {
  const seed = hash(`${platform}:${handle}`);
  const postEveryDays = 0.5 + (seed % 5) * 0.5; // entre 0,5 et 2,5 jours
  const reach = 2_000 + (seed % 50) * 1_500; // plafond moyen de vues par vidéo
  // Certains comptes "s'endorment" : ils ont arrêté de poster il y a quelques jours.
  const sleepingSinceDays = seed % 4 === 0 ? 2 + (seed % 6) : 0;

  const lastPost = now - sleepingSinceDays * DAY;
  const epoch = Math.floor(lastPost / (postEveryDays * DAY));
  const videos = [];
  for (let i = 0; i < maxVideos; i++) {
    const index = epoch - i;
    const publishedAt = Math.round(index * postEveryDays * DAY);
    const ageDays = (now - publishedAt) / DAY;
    const vSeed = hash(`${seed}:${index}`);
    const potential = reach * (0.2 + (vSeed % 100) / 40); // certaines vidéos percent
    const views = Math.round(potential * (1 - Math.exp(-ageDays / 2)));
    videos.push({
      platformVideoId: `${handle}-${index}`,
      url: `https://example.com/${platform}/${handle}/${index}`,
      title: `Clip #${index % 1000}`,
      publishedAt,
      views,
      likes: Math.round(views * 0.06),
      comments: Math.round(views * 0.004),
    });
  }
  return { displayName: handle, videos };
}
