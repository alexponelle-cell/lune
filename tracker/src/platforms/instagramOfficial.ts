import type Database from 'better-sqlite3';
import { type OAuthTokens, OAuthTokenStore } from './oauthTokens.js';
import type { FetchedAccount, PlatformFetcher } from './types.js';

/**
 * API Instagram officielle (gratuite, « Instagram API with Instagram Login ») : le clippeur passe son compte
 * en pro / créateur (gratuit, dans l'app), clique sur « Connecter mon Instagram », puis on lit ses reels et
 * leurs vues avec son jeton. La connexion prouve que le compte est à lui.
 */
export const INSTAGRAM_SCOPES = 'instagram_business_basic,instagram_business_manage_insights';
const GRAPH = 'https://graph.instagram.com/v22.0';
const DAY = 86_400_000;

export interface InstagramCredentials {
  appId: string;
  appSecret: string;
}

/** Jetons de chaque compte Instagram connecté (table instagram_tokens). */
export class InstagramTokenStore extends OAuthTokenStore {
  constructor(db: Database.Database) {
    super(db, 'instagram_tokens');
  }
}

type Fetch = typeof fetch;

async function call<T>(f: Fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || body.error) {
    const e = body.error;
    const msg = typeof e === 'object' ? e?.message : (body.error_message ?? e);
    throw new Error(`Instagram ${res.status}${msg ? ` : ${msg}` : ''}`);
  }
  return body as T;
}

/** Lien « Connecter mon Instagram » (page d'autorisation d'Instagram). */
export function instagramAuthorizeUrl(creds: InstagramCredentials, redirectUri: string, state: string): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({ client_id: creds.appId, redirect_uri: redirectUri, response_type: 'code', scope: INSTAGRAM_SCOPES, state }).toString();
  return url.toString();
}

/** Code reçu au retour d'Instagram → jeton courte durée → jeton longue durée (60 jours, renouvelable). */
export async function instagramExchangeCode(creds: InstagramCredentials, code: string, redirectUri: string, f: Fetch = fetch, now = Date.now()): Promise<OAuthTokens> {
  const short = await call<Record<string, any>>(f, 'https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: creds.appId, client_secret: creds.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }).toString(),
  });
  const first = Array.isArray(short.data) ? short.data[0] : short;
  if (!first?.access_token) throw new Error('Instagram : connexion refusée');
  const long = await call<Record<string, any>>(
    f,
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: creds.appSecret, access_token: first.access_token })}`,
  );
  const expiresAt = now + Number(long.expires_in ?? 60 * 86_400) * 1000;
  return { openId: String(first.user_id), accessToken: String(long.access_token), refreshToken: '', expiresAt, refreshExpiresAt: expiresAt };
}

export interface InstagramUser {
  id: string;
  username: string;
  followers?: number;
}

export async function instagramUser(accessToken: string, f: Fetch = fetch): Promise<InstagramUser> {
  const u = await call<Record<string, any>>(f, `${GRAPH}/me?${new URLSearchParams({ fields: 'user_id,username,followers_count', access_token: accessToken })}`);
  if (!u.username) throw new Error('Instagram : pseudo introuvable');
  return { id: String(u.user_id ?? u.id), username: String(u.username), followers: typeof u.followers_count === 'number' ? u.followers_count : undefined };
}

export class InstagramOfficialFetcher implements PlatformFetcher {
  readonly platform = 'instagram' as const;

  constructor(
    private readonly store: InstagramTokenStore,
    private readonly maxVideos: number,
    /** Compte pas connecté : Apify (payant) si fourni, sinon erreur « pas connecté ». */
    private readonly fallback?: PlatformFetcher,
    private readonly f: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Jeton valable : renouvelé (60 jours de plus) quand il expire dans moins de 10 jours. */
  private async token(accountId: number, t: OAuthTokens): Promise<string> {
    if (t.expiresAt <= this.now()) throw new Error('Connexion Instagram expirée : le clippeur doit reconnecter son Instagram sur le site');
    if (t.expiresAt - this.now() > 10 * DAY) return t.accessToken;
    try {
      const b = await call<Record<string, any>>(this.f, `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: t.accessToken })}`);
      const expiresAt = this.now() + Number(b.expires_in ?? 60 * 86_400) * 1000;
      this.store.save(accountId, { ...t, accessToken: String(b.access_token), expiresAt, refreshExpiresAt: expiresAt }, this.now());
      return String(b.access_token);
    } catch {
      return t.accessToken; // encore valable : on réessaiera au prochain relevé
    }
  }

  /** Vues d'un reel (métrique « views », ou « plays » sur les anciennes versions de l'API). */
  private async views(mediaId: string, token: string): Promise<number> {
    for (const metric of ['views', 'plays']) {
      try {
        const b = await call<{ data?: Array<{ values?: Array<{ value?: number }>; total_value?: { value?: number } }> }>(
          this.f,
          `${GRAPH}/${mediaId}/insights?${new URLSearchParams({ metric, access_token: token })}`,
        );
        const d = b.data?.[0];
        const v = d?.values?.[0]?.value ?? d?.total_value?.value;
        if (typeof v === 'number') return v;
      } catch {
        // métrique pas disponible pour ce média : on essaie la suivante
      }
    }
    return 0;
  }

  async fetchAccount(account: { id?: number; handle: string; externalId: string | null }): Promise<FetchedAccount> {
    const saved = account.id !== undefined ? this.store.get(account.id) : undefined;
    if (!saved || account.id === undefined) {
      if (this.fallback) return this.fallback.fetchAccount(account);
      throw new Error('Instagram pas connecté : le clippeur doit cliquer sur « Connecter mon Instagram » sur le site');
    }
    const token = await this.token(account.id, saved);
    const user = await instagramUser(token, this.f).catch(() => undefined);
    const media = await call<{ data?: Array<Record<string, any>> }>(
      this.f,
      `${GRAPH}/me/media?${new URLSearchParams({
        fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
        limit: String(Math.min(50, this.maxVideos * 2)),
        access_token: token,
      })}`,
    );
    // Seules les vidéos (reels) comptent : les photos n'ont pas de vues
    const videos = (media.data ?? []).filter((m) => m.media_type === 'VIDEO' || m.media_product_type === 'REELS').slice(0, this.maxVideos);
    return {
      displayName: user?.username,
      followers: user?.followers,
      videos: await Promise.all(
        videos.map(async (m) => ({
          platformVideoId: String(m.id),
          url: m.permalink,
          thumbnailUrl: m.thumbnail_url ?? m.media_url,
          title: m.caption,
          publishedAt: m.timestamp ? Date.parse(m.timestamp) : undefined,
          views: await this.views(String(m.id), token),
          likes: typeof m.like_count === 'number' ? m.like_count : undefined,
          comments: typeof m.comments_count === 'number' ? m.comments_count : undefined,
        })),
      ),
    };
  }
}
