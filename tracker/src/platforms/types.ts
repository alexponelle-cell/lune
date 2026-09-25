import type { Platform } from '../domain/links.js';
import type { VideoInput } from '../db/repo.js';

export interface FetchedAccount {
  /** ID stable côté plateforme (ex. ID de chaîne YouTube), mis en cache pour les appels suivants. */
  externalId?: string;
  displayName?: string;
  /** Vidéos récentes du compte avec leurs compteurs actuels. */
  videos: VideoInput[];
}

export interface PlatformFetcher {
  readonly platform: Platform;
  fetchAccount(account: { handle: string; externalId: string | null }): Promise<FetchedAccount>;
}

export type FetcherRegistry = Record<Platform, PlatformFetcher>;
