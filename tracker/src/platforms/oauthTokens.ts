import type Database from 'better-sqlite3';

/** Jetons d'une connexion officielle (TikTok, Instagram) : un par compte suivi. */
export interface OAuthTokens {
  /** ID du compte côté plateforme. */
  openId: string;
  accessToken: string;
  /** Instagram : pas de jeton séparé, le jeton longue durée se renouvelle lui-même. */
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export class OAuthTokenStore {
  constructor(
    private readonly db: Database.Database,
    private readonly table: 'tiktok_tokens' | 'instagram_tokens',
  ) {}

  get(accountId: number): OAuthTokens | undefined {
    const r = this.db.prepare(`SELECT * FROM ${this.table} WHERE account_id = ?`).get(accountId) as Record<string, any> | undefined;
    return r
      ? { openId: r.open_id, accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at, refreshExpiresAt: r.refresh_expires_at }
      : undefined;
  }

  save(accountId: number, t: OAuthTokens, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO ${this.table} (account_id, open_id, access_token, refresh_token, expires_at, refresh_expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET open_id = excluded.open_id, access_token = excluded.access_token,
           refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
           refresh_expires_at = excluded.refresh_expires_at, updated_at = excluded.updated_at`,
      )
      .run(accountId, t.openId, t.accessToken, t.refreshToken, t.expiresAt, t.refreshExpiresAt, now);
  }

  remove(accountId: number): void {
    this.db.prepare(`DELETE FROM ${this.table} WHERE account_id = ?`).run(accountId);
  }

  /** Comptes dont la connexion est encore valable. */
  connected(now = Date.now()): Set<number> {
    const rows = this.db.prepare(`SELECT account_id FROM ${this.table} WHERE refresh_expires_at > ?`).all(now) as Array<{ account_id: number }>;
    return new Set(rows.map((r) => r.account_id));
  }
}
