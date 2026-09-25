import type { Platform } from '../domain/links.js';
import type { RewardRule } from '../domain/rewards.js';
import type { Snapshot } from '../domain/stats.js';
import type { DB } from './index.js';

export interface Client {
  id: number;
  name: string;
  slug: string;
  discordChannelId: string | null;
  rule: RewardRule;
  monthlyFeeCents: number;
  createdAt: number;
}

export type ClipperStatus = 'actif' | 'inactif';

export interface Clipper {
  id: number;
  /** ID Discord, ou "manual:…" pour un clipper ajouté à la main depuis le dashboard. */
  discordId: string;
  username: string;
  clientId: number | null;
  status: ClipperStatus;
  createdAt: number;
}

export interface VideoRow {
  id: number;
  accountId: number;
  clipperId: number;
  platform: Platform;
  platformVideoId: string;
  url: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  publishedAt: number | null;
  views: number;
  likes: number | null;
  comments: number | null;
}

export interface Strike {
  id: number;
  clipperId: number;
  reason: string;
  createdAt: number;
}

export interface Account {
  id: number;
  clipperId: number;
  clientId: number | null;
  platform: Platform;
  handle: string;
  url: string;
  externalId: string | null;
  displayName: string | null;
  active: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface VideoInput {
  platformVideoId: string;
  url?: string;
  title?: string;
  publishedAt?: number;
  views: number;
  likes?: number;
  comments?: number;
  thumbnailUrl?: string;
}

type Row = Record<string, any>;

const toClient = (r: Row): Client => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  discordChannelId: r.discord_channel_id,
  rule: { ratePer1kCents: r.rate_per_1k_cents, minViews: r.min_views, capCents: r.cap_cents },
  monthlyFeeCents: r.monthly_fee_cents ?? 0,
  createdAt: r.created_at,
});

const toClipper = (r: Row): Clipper => ({
  id: r.id,
  discordId: r.discord_id,
  username: r.username,
  clientId: r.client_id ?? null,
  status: r.status === 'inactif' ? 'inactif' : 'actif',
  createdAt: r.created_at,
});

const VIDEO_COLUMNS = `v.id, v.account_id AS accountId, a.clipper_id AS clipperId, a.platform, v.platform_video_id AS platformVideoId,
  v.url, v.title, v.thumbnail_url AS thumbnailUrl, v.published_at AS publishedAt, v.views, v.likes, v.comments`;

const toAccount = (r: Row): Account => ({
  id: r.id,
  clipperId: r.clipper_id,
  clientId: r.client_id,
  platform: r.platform,
  handle: r.handle,
  url: r.url,
  externalId: r.external_id,
  displayName: r.display_name,
  active: r.active === 1,
  lastCheckedAt: r.last_checked_at,
  lastError: r.last_error,
  createdAt: r.created_at,
});

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Accès aux données. Toutes les requêtes SQL du projet vivent ici. */
export class Repo {
  constructor(readonly db: DB) {}

  // --- Clients ---------------------------------------------------------------

  upsertClient(input: {
    name: string;
    discordChannelId?: string | null;
    rule: RewardRule;
    now?: number;
  }): Client {
    const slug = slugify(input.name);
    this.db
      .prepare(
        `INSERT INTO clients (name, slug, discord_channel_id, rate_per_1k_cents, min_views, cap_cents, created_at)
         VALUES (@name, @slug, @channel, @rate, @min, @cap, @now)
         ON CONFLICT (slug) DO UPDATE SET
           name = excluded.name,
           discord_channel_id = COALESCE(excluded.discord_channel_id, clients.discord_channel_id),
           rate_per_1k_cents = excluded.rate_per_1k_cents,
           min_views = excluded.min_views,
           cap_cents = excluded.cap_cents`,
      )
      .run({
        name: input.name,
        slug,
        channel: input.discordChannelId ?? null,
        rate: input.rule.ratePer1kCents,
        min: input.rule.minViews,
        cap: input.rule.capCents,
        now: input.now ?? Date.now(),
      });
    return this.getClientBySlug(slug)!;
  }

  listClients(): Client[] {
    return this.db.prepare('SELECT * FROM clients ORDER BY name').all().map((r) => toClient(r as Row));
  }

  getClient(id: number): Client | undefined {
    const r = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    return r ? toClient(r as Row) : undefined;
  }

  getClientBySlug(slug: string): Client | undefined {
    const r = this.db.prepare('SELECT * FROM clients WHERE slug = ?').get(slug);
    return r ? toClient(r as Row) : undefined;
  }

  getClientByChannel(channelId: string): Client | undefined {
    const r = this.db.prepare('SELECT * FROM clients WHERE discord_channel_id = ?').get(channelId);
    return r ? toClient(r as Row) : undefined;
  }

  // --- Clippers --------------------------------------------------------------

  /** Crée ou met à jour un clipper. L'agence n'est posée que s'il n'en a pas encore. */
  upsertClipper(discordId: string, username: string, now = Date.now(), clientId: number | null = null): Clipper {
    const r = this.db
      .prepare(
        `INSERT INTO clippers (discord_id, username, client_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (discord_id) DO UPDATE SET
           username = excluded.username,
           client_id = COALESCE(clippers.client_id, excluded.client_id)
         RETURNING *`,
      )
      .get(discordId, username, clientId, now);
    return toClipper(r as Row);
  }

  getClipper(id: number): Clipper | undefined {
    const r = this.db.prepare('SELECT * FROM clippers WHERE id = ?').get(id);
    return r ? toClipper(r as Row) : undefined;
  }

  getClipperByDiscordId(discordId: string): Clipper | undefined {
    const r = this.db.prepare('SELECT * FROM clippers WHERE discord_id = ?').get(discordId);
    return r ? toClipper(r as Row) : undefined;
  }

  /** Clippers ayant au moins un compte actif. */
  listActiveClippers(): Clipper[] {
    return this.db
      .prepare(
        `SELECT DISTINCT c.* FROM clippers c
         JOIN accounts a ON a.clipper_id = c.id AND a.active = 1
         ORDER BY c.username`,
      )
      .all()
      .map((r) => toClipper(r as Row));
  }

  // --- Comptes ---------------------------------------------------------------

  getAccountByHandle(platform: Platform, handle: string): Account | undefined {
    const r = this.db.prepare('SELECT * FROM accounts WHERE platform = ? AND handle = ?').get(platform, handle);
    return r ? toAccount(r as Row) : undefined;
  }

  /**
   * Enregistre un compte pour un clipper. Si le compte appartient déjà à quelqu'un d'autre,
   * il n'est pas modifié et `conflict` contient le propriétaire actuel.
   */
  registerAccount(input: {
    clipperId: number;
    clientId: number | null;
    platform: Platform;
    handle: string;
    url: string;
    now?: number;
  }): { account: Account; created: boolean; conflict?: Clipper } {
    const existing = this.getAccountByHandle(input.platform, input.handle);
    if (existing) {
      if (existing.clipperId !== input.clipperId) {
        return { account: existing, created: false, conflict: this.getClipper(existing.clipperId) };
      }
      this.db
        .prepare('UPDATE accounts SET active = 1, client_id = COALESCE(?, client_id) WHERE id = ?')
        .run(input.clientId, existing.id);
      return { account: this.getAccountByHandle(input.platform, input.handle)!, created: false };
    }
    const r = this.db
      .prepare(
        `INSERT INTO accounts (clipper_id, client_id, platform, handle, url, created_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(input.clipperId, input.clientId, input.platform, input.handle, input.url, input.now ?? Date.now());
    return { account: toAccount(r as Row), created: true };
  }

  deactivateAccount(id: number): void {
    this.db.prepare('UPDATE accounts SET active = 0 WHERE id = ?').run(id);
  }

  listActiveAccounts(): Account[] {
    return this.db
      .prepare('SELECT * FROM accounts WHERE active = 1 ORDER BY last_checked_at IS NOT NULL, last_checked_at')
      .all()
      .map((r) => toAccount(r as Row));
  }

  listAccountsForClipper(clipperId: number, clientId?: number): Account[] {
    const sql =
      clientId === undefined
        ? 'SELECT * FROM accounts WHERE clipper_id = ? AND active = 1 ORDER BY platform, handle'
        : 'SELECT * FROM accounts WHERE clipper_id = ? AND client_id = ? AND active = 1 ORDER BY platform, handle';
    const params = clientId === undefined ? [clipperId] : [clipperId, clientId];
    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => toAccount(r as Row));
  }

  markAccountChecked(id: number, at: number, meta: { externalId?: string; displayName?: string; error?: string }): void {
    this.db
      .prepare(
        `UPDATE accounts SET
           last_checked_at = ?,
           last_error = ?,
           external_id = COALESCE(?, external_id),
           display_name = COALESCE(?, display_name)
         WHERE id = ?`,
      )
      .run(at, meta.error ?? null, meta.externalId ?? null, meta.displayName ?? null, id);
  }

  // --- Vidéos & captures -----------------------------------------------------

  /**
   * Enregistre le résultat d'une collecte : met à jour les vidéos, historise leurs vues,
   * puis capture le total du compte (somme des dernières vues connues de TOUTES ses vidéos,
   * y compris celles qui ne sont plus dans le lot récupéré).
   */
  recordCollection(accountId: number, videos: readonly VideoInput[], at: number): Snapshot {
    const upsertVideo = this.db.prepare(
      `INSERT INTO videos (account_id, platform_video_id, url, title, thumbnail_url, published_at, views, likes, comments, first_seen_at, updated_at)
       VALUES (@accountId, @id, @url, @title, @thumbnail, @publishedAt, @views, @likes, @comments, @at, @at)
       ON CONFLICT (account_id, platform_video_id) DO UPDATE SET
         url = COALESCE(excluded.url, videos.url),
         thumbnail_url = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
         title = COALESCE(excluded.title, videos.title),
         published_at = COALESCE(excluded.published_at, videos.published_at),
         views = MAX(videos.views, excluded.views),
         likes = COALESCE(excluded.likes, videos.likes),
         comments = COALESCE(excluded.comments, videos.comments),
         updated_at = excluded.updated_at
       RETURNING id`,
    );
    const insertVideoSnap = this.db.prepare(
      'INSERT INTO video_snapshots (video_id, captured_at, views, likes, comments) VALUES (?, ?, ?, ?, ?)',
    );
    const totals = this.db.prepare(
      'SELECT COALESCE(SUM(views), 0) AS total, COUNT(*) AS count FROM videos WHERE account_id = ?',
    );
    const insertAccountSnap = this.db.prepare(
      'INSERT INTO account_snapshots (account_id, captured_at, total_views, video_count) VALUES (?, ?, ?, ?)',
    );

    return this.db.transaction(() => {
      for (const v of videos) {
        const { id } = upsertVideo.get({
          accountId,
          id: v.platformVideoId,
          url: v.url ?? null,
          title: v.title ?? null,
          thumbnail: v.thumbnailUrl ?? null,
          publishedAt: v.publishedAt ?? null,
          views: v.views,
          likes: v.likes ?? null,
          comments: v.comments ?? null,
          at,
        }) as { id: number };
        insertVideoSnap.run(id, at, v.views, v.likes ?? null, v.comments ?? null);
      }
      const { total, count } = totals.get(accountId) as { total: number; count: number };
      insertAccountSnap.run(accountId, at, total, count);
      return { capturedAt: at, totalViews: total };
    })();
  }

  getAccountSnapshots(accountId: number, since = 0): Snapshot[] {
    // On prend aussi la dernière capture avant `since` pour pouvoir calculer une différence.
    return this.db
      .prepare(
        `SELECT captured_at AS capturedAt, total_views AS totalViews FROM account_snapshots
         WHERE account_id = @id AND captured_at >= COALESCE(
           (SELECT MAX(captured_at) FROM account_snapshots WHERE account_id = @id AND captured_at <= @since), 0)
         ORDER BY captured_at`,
      )
      .all({ id: accountId, since }) as Snapshot[];
  }

  lastPostAt(clipperId: number): number | null {
    const r = this.db
      .prepare(
        `SELECT MAX(v.published_at) AS last FROM videos v
         JOIN accounts a ON a.id = v.account_id
         WHERE a.clipper_id = ? AND a.active = 1`,
      )
      .get(clipperId) as { last: number | null };
    return r.last;
  }

  topVideos(clipperId: number, limit = 5): Array<{ title: string | null; url: string | null; views: number; platform: Platform }> {
    return this.db
      .prepare(
        `SELECT v.title, v.url, v.views, a.platform FROM videos v
         JOIN accounts a ON a.id = v.account_id
         WHERE a.clipper_id = ? AND a.active = 1
         ORDER BY v.views DESC LIMIT ?`,
      )
      .all(clipperId, limit) as any;
  }

  // --- Relances --------------------------------------------------------------

  lastRelanceAt(clipperId: number, kind: string): number | null {
    const r = this.db
      .prepare('SELECT MAX(sent_at) AS last FROM relances WHERE clipper_id = ? AND kind = ?')
      .get(clipperId, kind) as { last: number | null };
    return r.last;
  }

  logRelance(clipperId: number, kind: string, message: string, at: number): void {
    this.db
      .prepare('INSERT INTO relances (clipper_id, kind, message, sent_at) VALUES (?, ?, ?, ?)')
      .run(clipperId, kind, message, at);
  }

  // --- Agences (clients) : gestion depuis le dashboard ----------------------

  updateClient(
    id: number,
    patch: { name?: string; discordChannelId?: string | null; monthlyFeeCents?: number },
  ): Client | undefined {
    const current = this.getClient(id);
    if (!current) return undefined;
    this.db
      .prepare('UPDATE clients SET name = ?, discord_channel_id = ?, monthly_fee_cents = ? WHERE id = ?')
      .run(
        patch.name ?? current.name,
        patch.discordChannelId === undefined ? current.discordChannelId : patch.discordChannelId,
        patch.monthlyFeeCents ?? current.monthlyFeeCents,
        id,
      );
    return this.getClient(id);
  }

  deleteClient(id: number): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM reward_rules WHERE scope = 'client' AND scope_id = ?").run(id);
      this.db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    })();
  }

  // --- Clippers : gestion depuis le dashboard -------------------------------

  listClippers(opts: { clientId?: number; includeInactive?: boolean } = {}): Clipper[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.clientId !== undefined) {
      where.push('client_id = ?');
      params.push(opts.clientId);
    }
    if (!opts.includeInactive) where.push("status = 'actif'");
    const sql = `SELECT * FROM clippers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY username COLLATE NOCASE`;
    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => toClipper(r as Row));
  }

  createManualClipper(username: string, clientId: number | null, now = Date.now()): Clipper {
    const r = this.db
      .prepare('INSERT INTO clippers (discord_id, username, client_id, created_at) VALUES (?, ?, ?, ?) RETURNING *')
      .get(`manual:${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`, username, clientId, now);
    return toClipper(r as Row);
  }

  updateClipper(id: number, patch: { username?: string; clientId?: number | null; status?: ClipperStatus }): Clipper | undefined {
    const current = this.getClipper(id);
    if (!current) return undefined;
    this.db
      .prepare('UPDATE clippers SET username = ?, client_id = ?, status = ? WHERE id = ?')
      .run(
        patch.username ?? current.username,
        patch.clientId === undefined ? current.clientId : patch.clientId,
        patch.status ?? current.status,
        id,
      );
    return this.getClipper(id);
  }

  deleteClipper(id: number): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM reward_rules WHERE scope = 'clipper' AND scope_id = ?").run(id);
      this.db.prepare('DELETE FROM clippers WHERE id = ?').run(id);
    })();
  }

  /** Date du tout premier relevé (début de l'historique "all-time"). */
  firstSnapshotAt(): number | null {
    const r = this.db.prepare('SELECT MIN(captured_at) AS first FROM account_snapshots').get() as { first: number | null };
    return r.first;
  }

  // --- Vidéos ----------------------------------------------------------------

  /** Vidéos publiées dans [from, to[, éventuellement limitées à certains clippers. */
  videosPublished(from: number, to: number, clipperIds?: readonly number[]): VideoRow[] {
    if (clipperIds && clipperIds.length === 0) return [];
    const filter = clipperIds ? `AND a.clipper_id IN (${clipperIds.map(() => '?').join(',')})` : '';
    return this.db
      .prepare(
        `SELECT ${VIDEO_COLUMNS} FROM videos v JOIN accounts a ON a.id = v.account_id
         WHERE a.active = 1 AND v.published_at >= ? AND v.published_at < ? ${filter}
         ORDER BY v.published_at DESC`,
      )
      .all(from, to, ...(clipperIds ?? [])) as VideoRow[];
  }

  /** Meilleures vidéos (vues actuelles) d'une plateforme, publiées dans [from, to[. */
  bestVideos(platform: Platform, from: number, to: number, limit = 10, clipperIds?: readonly number[]): VideoRow[] {
    if (clipperIds && clipperIds.length === 0) return [];
    const filter = clipperIds ? `AND a.clipper_id IN (${clipperIds.map(() => '?').join(',')})` : '';
    return this.db
      .prepare(
        `SELECT ${VIDEO_COLUMNS} FROM videos v JOIN accounts a ON a.id = v.account_id
         WHERE a.active = 1 AND a.platform = ? AND COALESCE(v.published_at, v.first_seen_at) >= ?
           AND COALESCE(v.published_at, v.first_seen_at) < ? ${filter}
         ORDER BY v.views DESC LIMIT ?`,
      )
      .all(platform, from, to, ...(clipperIds ?? []), limit) as VideoRow[];
  }

  getVideo(id: number): VideoRow | undefined {
    return this.db
      .prepare(`SELECT ${VIDEO_COLUMNS} FROM videos v JOIN accounts a ON a.id = v.account_id WHERE v.id = ?`)
      .get(id) as VideoRow | undefined;
  }

  // --- Strikes ---------------------------------------------------------------

  addStrike(clipperId: number, reason: string, at = Date.now()): Strike {
    const r = this.db
      .prepare('INSERT INTO strikes (clipper_id, reason, created_at) VALUES (?, ?, ?) RETURNING id')
      .get(clipperId, reason, at) as { id: number };
    return { id: r.id, clipperId, reason, createdAt: at };
  }

  deleteStrike(id: number): void {
    this.db.prepare('DELETE FROM strikes WHERE id = ?').run(id);
  }

  strikes(clipperId: number, from = 0, to = Number.MAX_SAFE_INTEGER): Strike[] {
    return this.db
      .prepare(
        `SELECT id, clipper_id AS clipperId, reason, created_at AS createdAt FROM strikes
         WHERE clipper_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC`,
      )
      .all(clipperId, from, to) as Strike[];
  }

  // --- Retours ---------------------------------------------------------------

  addFeedback(clipperId: number, videoId: number | null, message: string, at = Date.now()): number {
    const r = this.db
      .prepare('INSERT INTO feedbacks (clipper_id, video_id, message, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .get(clipperId, videoId, message, at) as { id: number };
    return r.id;
  }

  markFeedbackDelivered(id: number): void {
    this.db.prepare('UPDATE feedbacks SET delivered = 1 WHERE id = ?').run(id);
  }

  feedbackCounts(videoIds: readonly number[]): Map<number, number> {
    if (videoIds.length === 0) return new Map();
    const rows = this.db
      .prepare(
        `SELECT video_id AS id, COUNT(*) AS n FROM feedbacks WHERE video_id IN (${videoIds.map(() => '?').join(',')}) GROUP BY video_id`,
      )
      .all(...videoIds) as Array<{ id: number; n: number }>;
    return new Map(rows.map((r) => [r.id, r.n]));
  }

  // --- Barèmes & réglages ----------------------------------------------------

  getRewardRule(scope: string, scopeId: number): unknown | undefined {
    const r = this.db.prepare('SELECT config FROM reward_rules WHERE scope = ? AND scope_id = ?').get(scope, scopeId) as
      | { config: string }
      | undefined;
    return r ? JSON.parse(r.config) : undefined;
  }

  setRewardRule(scope: string, scopeId: number, config: unknown, at = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO reward_rules (scope, scope_id, config, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (scope, scope_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
      )
      .run(scope, scopeId, JSON.stringify(config), at);
  }

  deleteRewardRule(scope: string, scopeId: number): void {
    this.db.prepare('DELETE FROM reward_rules WHERE scope = ? AND scope_id = ?').run(scope, scopeId);
  }

  listRewardRuleScopes(): Array<{ scope: string; scopeId: number }> {
    return this.db.prepare('SELECT scope, scope_id AS scopeId FROM reward_rules').all() as Array<{
      scope: string;
      scopeId: number;
    }>;
  }

  getSetting<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }
}
