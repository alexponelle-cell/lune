import type Database from 'better-sqlite3';
import { type OAuthTokens, OAuthTokenStore } from './oauthTokens.js';
import type { FetchedAccount, PlatformFetcher } from './types.js';

/**
 * API officielle TikTok (gratuite) : le clippeur connecte son compte sur le site (OAuth « Login Kit »),
 * puis on lit ses vidéos et leurs vues avec son jeton (Display API). Plus besoin d'Apify pour ce compte,
 * et la connexion prouve que le compte est bien à lui.
 */
export const TIKTOK_SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const API = 'https://open.tiktokapis.com/v2';

export interface TikTokCredentials {
  clientKey: string;
  clientSecret: string;
}

export type TikTokTokens = OAuthTokens;

/** Jetons OAuth de chaque compte TikTok connecté (table tiktok_tokens). */
export class TikTokTokenStore extends OAuthTokenStore {
  constructor(db: Database.Database) {
    super(db, 'tiktok_tokens');
  }
}

type Fetch = typeof fetch;

async function call<T>(f: Fetch, url: string, init: RequestInit): Promise<T> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  // Réponses de l'API : { data, error: { code: 'ok' | … } } ; jetons : { access_token, … } ou { error, error_description }
  const code = typeof body.error === 'object' ? body.error?.code : body.error;
  if (!res.ok || (code && code !== 'ok')) {
    const msg = typeof body.error === 'object' ? body.error?.message : body.error_description;
    throw new Error(`TikTok ${res.status}${code ? ` ${code}` : ''}${msg ? ` : ${msg}` : ''}`);
  }
  return body as T;
}

const tokensFrom = (b: Record<string, any>, now: number): TikTokTokens => ({
  openId: String(b.open_id),
  accessToken: String(b.access_token),
  refreshToken: String(b.refresh_token),
  expiresAt: now + Number(b.expires_in ?? 86_400) * 1000,
  refreshExpiresAt: now + Number(b.refresh_expires_in ?? 365 * 86_400) * 1000,
});

/** Lien « Connecter mon TikTok » (page d'autorisation de TikTok). */
export function tiktokAuthorizeUrl(creds: TikTokCredentials, redirectUri: string, state: string): string {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  // disable_auto_auth : la page d'autorisation s'affiche toujours (on voit ce qu'on accepte, même en se reconnectant)
  url.search = new URLSearchParams({ client_key: creds.clientKey, scope: TIKTOK_SCOPES, response_type: 'code', redirect_uri: redirectUri, state, disable_auto_auth: '1' }).toString();
  return url.toString();
}

const tokenRequest = (f: Fetch, creds: TikTokCredentials, params: Record<string, string>) =>
  call<Record<string, any>>(f, `${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: creds.clientKey, client_secret: creds.clientSecret, ...params }).toString(),
  });

/** Code reçu au retour de TikTok → jetons du clippeur. */
export async function tiktokExchangeCode(creds: TikTokCredentials, code: string, redirectUri: string, f: Fetch = fetch, now = Date.now()): Promise<TikTokTokens> {
  return tokensFrom(await tokenRequest(f, creds, { code, grant_type: 'authorization_code', redirect_uri: redirectUri }), now);
}

export interface TikTokUser {
  openId: string;
  username: string;
  displayName?: string;
  followers?: number;
}

export async function tiktokUser(accessToken: string, f: Fetch = fetch): Promise<TikTokUser> {
  const b = await call<{ data?: { user?: Record<string, any> } }>(f, `${API}/user/info/?fields=open_id,username,display_name,follower_count`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const u = b.data?.user ?? {};
  if (!u.username) throw new Error('TikTok : pseudo introuvable (autorisation « profil » refusée ?)');
  return { openId: String(u.open_id), username: String(u.username), displayName: u.display_name, followers: typeof u.follower_count === 'number' ? u.follower_count : undefined };
}

export class TikTokOfficialFetcher implements PlatformFetcher {
  readonly platform = 'tiktok' as const;

  constructor(
    private readonly store: TikTokTokenStore,
    private readonly creds: TikTokCredentials,
    private readonly maxVideos: number,
    /** Compte pas connecté : Apify (payant) si fourni, sinon erreur « pas connecté ». */
    private readonly fallback?: PlatformFetcher,
    private readonly f: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Jeton valable (renouvelé s'il expire dans moins d'une minute). */
  private async token(accountId: number, t: TikTokTokens): Promise<string> {
    if (t.expiresAt > this.now() + 60_000) return t.accessToken;
    if (t.refreshExpiresAt <= this.now()) throw new Error('Connexion TikTok expirée : le clippeur doit reconnecter son TikTok sur le site');
    const fresh = tokensFrom(await tokenRequest(this.f, this.creds, { grant_type: 'refresh_token', refresh_token: t.refreshToken }), this.now());
    this.store.save(accountId, fresh, this.now());
    return fresh.accessToken;
  }

  async fetchAccount(account: { id?: number; handle: string; externalId: string | null }): Promise<FetchedAccount> {
    const saved = account.id !== undefined ? this.store.get(account.id) : undefined;
    if (!saved || account.id === undefined) {
      if (this.fallback) return this.fallback.fetchAccount(account);
      throw new Error('TikTok pas connecté : le clippeur doit cliquer sur « Connecter mon TikTok » sur le site');
    }
    const token = await this.token(account.id, saved);
    const user = await tiktokUser(token, this.f).catch(() => undefined);
    const videos: FetchedAccount['videos'] = [];
    let cursor: number | undefined;
    while (videos.length < this.maxVideos) {
      const b = await call<{ data?: { videos?: Array<Record<string, any>>; cursor?: number; has_more?: boolean } }>(
        this.f,
        `${API}/video/list/?fields=id,title,video_description,create_time,view_count,like_count,comment_count,share_url,cover_image_url`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ max_count: Math.min(20, this.maxVideos - videos.length), ...(cursor !== undefined ? { cursor } : {}) }),
        },
      );
      for (const v of b.data?.videos ?? []) {
        if (!v.id) continue;
        videos.push({
          platformVideoId: String(v.id),
          url: v.share_url,
          thumbnailUrl: v.cover_image_url,
          title: v.video_description || v.title,
          publishedAt: typeof v.create_time === 'number' ? v.create_time * 1000 : undefined,
          views: typeof v.view_count === 'number' ? v.view_count : 0,
          likes: v.like_count,
          comments: v.comment_count,
        });
      }
      if (!b.data?.has_more || !b.data.videos?.length) break;
      cursor = b.data.cursor;
    }
    return { displayName: user?.displayName, followers: user?.followers, videos };
  }
}

/**
 * Fichier de vérification du site (« URL prefix ») : le contenu suffit, le nom s'en déduit
 * (« tiktok-developers-site-verification=ABC » → /tiktokABC.txt). Accepte le contenu dans l'une ou l'autre variable.
 */
export function tiktokSiteVerification(...values: Array<string | undefined>): { file: string; content: string } | undefined {
  const content = values.map((v) => v?.trim()).find((v) => v && /^tiktok-developers-site-verification=\S+$/.test(v));
  if (content) return { file: `tiktok${content.split('=')[1]}.txt`, content };
  const [content2, file] = values.map((v) => v?.trim());
  return content2 && file ? { file, content: content2 } : undefined;
}
