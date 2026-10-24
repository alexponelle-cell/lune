import type Database from 'better-sqlite3';
import { OAuthTokenStore } from './oauthTokens.js';

/**
 * « Connecter mon YouTube » (connexion Google, gratuite) : prouve que la chaîne est au clippeur. Les vues restent
 * lues avec la clé API (YOUTUBE_API_KEY) : on ne garde aucun accès au compte, le jeton est révoqué aussitôt.
 */
export const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

/** Chaînes reliées par la connexion Google (table youtube_tokens, sans jeton : la preuve suffit). */
export class YouTubeTokenStore extends OAuthTokenStore {
  constructor(db: Database.Database) {
    super(db, 'youtube_tokens');
  }
}

type Fetch = typeof fetch;

async function call<T>(f: Fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || body.error) {
    const e = body.error;
    const msg = typeof e === 'object' ? e?.message : (body.error_description ?? e);
    throw new Error(`YouTube ${res.status}${msg ? ` : ${msg}` : ''}`);
  }
  return body as T;
}

/** Lien « Connecter mon YouTube » (page de connexion Google). */
export function youtubeAuthorizeUrl(creds: GoogleCredentials, redirectUri: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirectUri, response_type: 'code', scope: YOUTUBE_SCOPES, state, prompt: 'select_account' }).toString();
  return url.toString();
}

export interface YouTubeChannel {
  id: string;
  /** Pseudo @ de la chaîne, sans le @. */
  handle: string;
}

/** Code reçu au retour de Google → chaîne du clippeur. Le jeton est révoqué juste après (aucun accès gardé). */
export async function youtubeConnectChannel(creds: GoogleCredentials, code: string, redirectUri: string, f: Fetch = fetch): Promise<YouTubeChannel> {
  const t = await call<Record<string, any>>(f, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }).toString(),
  });
  if (!t.access_token) throw new Error('YouTube : connexion refusée');
  try {
    const r = await call<{ items?: Array<{ id: string; snippet?: { customUrl?: string } }> }>(f, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { authorization: `Bearer ${t.access_token}` },
    });
    const c = r.items?.[0];
    if (!c) throw new Error('Aucune chaîne YouTube sur ce compte Google : choisis le compte de ta chaîne, puis réessaie.');
    const handle = c.snippet?.customUrl?.replace(/^@/, '');
    if (!handle) throw new Error('Ta chaîne n’a pas encore de pseudo @ : crée-le dans YouTube (Ma chaîne → Personnaliser → Identifiant), puis réessaie.');
    return { id: c.id, handle };
  } finally {
    await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.access_token)}`, { method: 'POST' }).catch(() => {});
  }
}
