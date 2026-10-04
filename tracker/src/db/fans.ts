import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './index.js';

type Row = Record<string, any>;

export type ItemKind = 'gamepass' | 'item';
export type OrderStatus = 'pending' | 'delivered' | 'refunded';

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  kind: ItemKind;
  ref: string;
  stock: number | null;
  active: boolean;
  createdAt: number;
}

export interface ShopOrder {
  id: number;
  clipperId: number;
  itemId: number | null;
  itemName: string;
  kind: ItemKind;
  ref: string;
  price: number;
  status: OrderStatus;
  createdAt: number;
  deliveredAt: number | null;
  /** Dernière erreur de livraison par l'API du jeu (null si aucune). */
  deliveryError: string | null;
  /** Validé par le staff (null = à valider : pas encore livré). */
  approvedAt: number | null;
}

export interface Roblox {
  username: string | null;
  userId: number | null;
}

const toItem = (r: Row): ShopItem => ({
  id: r.id,
  name: r.name,
  description: r.description,
  imageUrl: r.image_url,
  price: r.price,
  kind: r.kind,
  ref: r.ref,
  stock: r.stock,
  active: r.active === 1,
  createdAt: r.created_at,
});

const toOrder = (r: Row): ShopOrder => ({
  id: r.id,
  clipperId: r.clipper_id,
  itemId: r.item_id,
  itemName: r.item_name,
  kind: r.kind,
  ref: r.ref,
  price: r.price,
  status: r.status,
  createdAt: r.created_at,
  deliveredAt: r.delivered_at,
  deliveryError: r.delivery_error ?? null,
  approvedAt: r.approved_at ?? null,
});

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface ItemInput {
  name: string;
  description?: string;
  imageUrl?: string | null;
  price: number;
  kind: ItemKind;
  ref: string;
  stock?: number | null;
  active?: boolean;
}

/** Espace fan : jetons de connexion, compte Roblox, boutique et commandes. */
export class FanRepo {
  constructor(readonly db: DB) {}

  // --- Jetons (lien de connexion à usage unique, session) ------------------------------

  /** Crée un jeton et renvoie sa valeur en clair (seul le hash est stocké). */
  createToken(clipperId: number, kind: 'login' | 'session', ttlMs: number, now = Date.now()): string {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO fan_tokens (hash, clipper_id, kind, expires_at) VALUES (?, ?, ?, ?)')
      .run(hash(token), clipperId, kind, now + ttlMs);
    // Ménage des jetons expirés
    this.db.prepare('DELETE FROM fan_tokens WHERE expires_at < ?').run(now - 86_400_000);
    return token;
  }

  /** Utilise un lien de connexion (une seule fois). Renvoie l'ID du fan. */
  consumeLogin(token: string, now = Date.now()): number | null {
    const r = this.db
      .prepare(
        "UPDATE fan_tokens SET used_at = ? WHERE hash = ? AND kind = 'login' AND used_at IS NULL AND expires_at > ? RETURNING clipper_id",
      )
      .get(now, hash(token), now) as Row | undefined;
    return r ? r.clipper_id : null;
  }

  sessionClipper(token: string, now = Date.now()): number | null {
    const r = this.db
      .prepare("SELECT clipper_id FROM fan_tokens WHERE hash = ? AND kind = 'session' AND expires_at > ?")
      .get(hash(token), now) as Row | undefined;
    return r ? r.clipper_id : null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM fan_tokens WHERE hash = ? AND kind = 'session'").run(hash(token));
  }

  // --- Roblox ------------------------------------------------------------------------

  roblox(clipperId: number): Roblox {
    const r = this.db.prepare('SELECT roblox_username, roblox_user_id FROM clippers WHERE id = ?').get(clipperId) as Row | undefined;
    return { username: r?.roblox_username ?? null, userId: r?.roblox_user_id ?? null };
  }

  setRoblox(clipperId: number, username: string, userId: number): void {
    this.db.prepare('UPDATE clippers SET roblox_username = ?, roblox_user_id = ? WHERE id = ?').run(username, userId, clipperId);
  }

  /** Fan déjà relié à ce compte Roblox (un compte Roblox = un seul fan). */
  email(clipperId: number): string | null {
    return ((this.db.prepare('SELECT reward_email FROM clippers WHERE id = ?').get(clipperId) as Row | undefined)?.reward_email as string | null) ?? null;
  }

  setEmail(clipperId: number, email: string | null): void {
    this.db.prepare('UPDATE clippers SET reward_email = ? WHERE id = ?').run(email, clipperId);
  }

  /** Coins ajoutés (ou retirés) à la main par le staff. */
  bonus(clipperId: number): number {
    return ((this.db.prepare('SELECT bonus_coins FROM clippers WHERE id = ?').get(clipperId) as Row | undefined)?.bonus_coins as number) ?? 0;
  }

  addBonus(clipperId: number, amount: number): void {
    this.db.prepare('UPDATE clippers SET bonus_coins = bonus_coins + ? WHERE id = ?').run(amount, clipperId);
  }

  /** Clips de fans publiés depuis `since` (après l'ajout du compte) avec leur état de vérification actuel. */
  clipsToCheck(clientId: number, since: number): Array<{ id: number; title: string | null; check: 'ok' | 'no' | null }> {
    return this.db
      .prepare(
        `SELECT v.id, v.title, v.clip_check AS "check" FROM videos v
           JOIN accounts a ON a.id = v.account_id AND a.active = 1
           JOIN clippers c ON c.id = a.clipper_id
          WHERE c.client_id = ? AND v.published_at >= ? AND v.published_at >= a.created_at`,
      )
      .all(clientId, since) as Array<{ id: number; title: string | null; check: 'ok' | 'no' | null }>;
  }

  setClipCheck(videoId: number, ok: boolean, reason: string): void {
    this.db.prepare('UPDATE videos SET clip_check = ?, clip_reason = ? WHERE id = ?').run(ok ? 'ok' : 'no', reason, videoId);
  }

  /** Clips refusés (légende sans le créateur), par fan (affichés dans Mars). */
  refusedClips(clientId: number): Map<number, Array<{ title: string | null; url: string | null; reason: string | null }>> {
    const rows = this.db
      .prepare(
        `SELECT a.clipper_id AS id, v.title, v.url, v.clip_reason AS reason FROM videos v
           JOIN accounts a ON a.id = v.account_id JOIN clippers c ON c.id = a.clipper_id
          WHERE c.client_id = ? AND v.clip_check = 'no' ORDER BY v.views DESC`,
      )
      .all(clientId) as Array<{ id: number; title: string | null; url: string | null; reason: string | null }>;
    const out = new Map<number, Array<{ title: string | null; url: string | null; reason: string | null }>>();
    for (const r of rows) out.set(r.id, [...(out.get(r.id) ?? []), { title: r.title, url: r.url, reason: r.reason }]);
    return out;
  }

  /** Code perso à mettre dans la bio pour prouver que le compte est à soi. */
  verifyCode(clipperId: number): string | null {
    return ((this.db.prepare('SELECT verify_code FROM clippers WHERE id = ?').get(clipperId) as Row | undefined)?.verify_code as string | null) ?? null;
  }

  setVerifyCode(clipperId: number, code: string): void {
    this.db.prepare('UPDATE clippers SET verify_code = ? WHERE id = ?').run(code, clipperId);
  }

  /** null = rien à signaler · pending = à vérifier par le staff (achats bloqués) · approved = validé par le staff. */
  reviewStatus(clipperId: number): 'pending' | 'approved' | null {
    return ((this.db.prepare('SELECT review_status FROM clippers WHERE id = ?').get(clipperId) as Row | undefined)?.review_status as 'pending' | 'approved' | null) ?? null;
  }

  setReviewStatus(clipperId: number, status: 'pending' | 'approved' | null): void {
    this.db.prepare('UPDATE clippers SET review_status = ? WHERE id = ?').run(status, clipperId);
  }

  /**
   * Fans à faire vérifier : compte avec beaucoup d'abonnés, ou clip qui explose dans les 7 jours qui suivent
   * l'ajout du compte (signe d'un compte qui n'est pas à lui). Jamais ceux déjà validés par le staff.
   */
  suspiciousClippers(clientId: number, maxFollowers: number, maxEarlyViews: number): Array<{ id: number; reason: string }> {
    const rows = this.db
      .prepare(
        `SELECT c.id, a.platform, a.handle, a.followers,
                (SELECT MAX(v.views) FROM videos v
                  WHERE v.account_id = a.id AND v.published_at >= a.created_at AND v.published_at < a.created_at + 7 * 86400000) AS early
           FROM clippers c JOIN accounts a ON a.clipper_id = c.id AND a.active = 1
          WHERE c.client_id = ? AND c.review_status IS NULL`,
      )
      .all(clientId) as Array<{ id: number; platform: string; handle: string; followers: number | null; early: number | null }>;
    const out = new Map<number, string>();
    for (const r of rows) {
      if ((r.followers ?? 0) > maxFollowers) out.set(r.id, `@${r.handle} (${r.platform}) : ${r.followers!.toLocaleString('fr-FR')} abonnés`);
      else if ((r.early ?? 0) > maxEarlyViews && !out.has(r.id)) out.set(r.id, `@${r.handle} (${r.platform}) : un clip à ${r.early!.toLocaleString('fr-FR')} vues dès les premiers jours`);
    }
    return [...out].map(([id, reason]) => ({ id, reason }));
  }

  clipperByEmail(email: string): number | null {
    const r = this.db.prepare('SELECT id FROM clippers WHERE reward_email = ?').get(email) as Row | undefined;
    return r?.id ?? null;
  }

  clipperByRoblox(userId: number): number | null {
    const r = this.db.prepare('SELECT id FROM clippers WHERE roblox_user_id = ?').get(userId) as Row | undefined;
    return r ? r.id : null;
  }

  avatar(clipperId: number): string | null {
    const r = this.db.prepare('SELECT avatar_url FROM clippers WHERE id = ?').get(clipperId) as Row | undefined;
    return r?.avatar_url ?? null;
  }

  avatars(ids: readonly number[]): Map<number, string | null> {
    if (!ids.length) return new Map();
    const rows = this.db.prepare(`SELECT id, avatar_url FROM clippers WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Row[];
    return new Map(rows.map((r) => [r.id, r.avatar_url]));
  }

  setAvatar(clipperId: number, url: string | null): void {
    this.db.prepare('UPDATE clippers SET avatar_url = ? WHERE id = ?').run(url, clipperId);
  }

  /** Clips détectés sur les comptes du fan, avec les vues gagnées depuis le début du suivi. */
  clips(clipperId: number, limit = 40): Array<{ platform: string; url: string | null; title: string | null; thumbnail: string | null; views: number; gained: number; publishedAt: number | null }> {
    return (
      this.db
        .prepare(
          `SELECT a.platform, v.url, v.title, v.thumbnail_url, v.views, MAX(v.views - v.baseline_views, 0) AS gained, COALESCE(v.published_at, v.first_seen_at) AS at
           FROM videos v JOIN accounts a ON a.id = v.account_id
           WHERE a.clipper_id = ? AND a.active = 1 ORDER BY at DESC LIMIT ?`,
        )
        .all(clipperId, limit) as Row[]
    ).map((r) => ({ platform: r.platform, url: r.url, title: r.title, thumbnail: r.thumbnail_url, views: r.views, gained: r.gained, publishedAt: r.at }));
  }

  /**
   * Vues gagnées par fan sur ses clips publiés APRÈS avoir relié le compte (règle du programme fans :
   * les vidéos déjà en ligne avant l'inscription ne rapportent rien, même si elles continuent de monter).
   * `from` : seulement les vues gagnées depuis cette date (classement de la semaine).
   */
  freshClipViews(clientId: number, from = 0, ruleSince: number | null = null): Map<number, number> {
    const rows = this.db
      .prepare(
        `SELECT a.clipper_id AS id, SUM(MAX(v.views - COALESCE(
              (SELECT vs.views FROM video_snapshots vs WHERE vs.video_id = v.id AND vs.captured_at <= @from ORDER BY vs.captured_at DESC LIMIT 1),
              v.baseline_views), 0)) AS views
           FROM videos v
           JOIN accounts a ON a.id = v.account_id AND a.active = 1
           JOIN clippers c ON c.id = a.clipper_id
          WHERE c.client_id = @clientId AND a.verified_at IS NOT NULL AND v.published_at IS NOT NULL AND v.published_at >= a.created_at
            AND (@since IS NULL OR v.published_at < @since OR v.clip_check = 'ok')
          GROUP BY a.clipper_id`,
      )
      .all({ clientId, from, since: ruleSince }) as Array<{ id: number; views: number }>;
    return new Map(rows.map((r) => [r.id, r.views]));
  }

  /** Discord des fans du client qui ont posté au moins un clip après avoir relié le compte (1er clip = accès au serveur). */
  firstClipDiscordIds(clientId: number, ruleSince: number | null = null): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.discord_id AS id FROM clippers c
           JOIN accounts a ON a.clipper_id = c.id AND a.active = 1 AND a.verified_at IS NOT NULL
           JOIN videos v ON v.account_id = a.id
         WHERE c.client_id = @clientId AND COALESCE(v.published_at, v.first_seen_at) >= a.created_at
           AND (@since IS NULL OR v.published_at < @since OR v.clip_check = 'ok')`,
      )
      .all({ clientId, since: ruleSince }) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }

  clipCount(clipperId: number): number {
    const r = this.db
      .prepare('SELECT COUNT(*) AS n FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.clipper_id = ? AND a.active = 1')
      .get(clipperId) as Row;
    return r.n;
  }

  // --- Notifications ------------------------------------------------------------------

  notifyEnabled(clipperId: number): boolean {
    const r = this.db.prepare('SELECT notify FROM clippers WHERE id = ?').get(clipperId) as Row | undefined;
    return r ? r.notify === 1 : false;
  }

  setNotify(clipperId: number, on: boolean): void {
    this.db.prepare('UPDATE clippers SET notify = ? WHERE id = ?').run(on ? 1 : 0, clipperId);
  }

  notifyState(clipperId: number): { earnedBase: number; level: number; lastSentAt: number | null } | null {
    const r = this.db.prepare('SELECT * FROM fan_notify_state WHERE clipper_id = ?').get(clipperId) as Row | undefined;
    return r ? { earnedBase: r.earned_base, level: r.level, lastSentAt: r.last_sent_at } : null;
  }

  saveNotifyState(clipperId: number, st: { earnedBase: number; level: number; lastSentAt: number | null }): void {
    this.db
      .prepare(
        `INSERT INTO fan_notify_state (clipper_id, earned_base, level, last_sent_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (clipper_id) DO UPDATE SET earned_base = excluded.earned_base, level = excluded.level, last_sent_at = excluded.last_sent_at`,
      )
      .run(clipperId, st.earnedBase, st.level, st.lastSentAt);
  }

  wasNotified(clipperId: number, key: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM fan_notified WHERE clipper_id = ? AND key = ?').get(clipperId, key);
  }

  markNotified(clipperId: number, key: string, now = Date.now()): void {
    this.db.prepare('INSERT OR IGNORE INTO fan_notified (clipper_id, key, created_at) VALUES (?, ?, ?)').run(clipperId, key, now);
  }

  queueNotification(clipperId: number, discordId: string, kind: string, text: string, now = Date.now()): void {
    this.db
      .prepare('INSERT INTO fan_notifications (clipper_id, discord_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(clipperId, discordId, kind, text, now);
  }

  pendingNotifications(limit = 50): Array<{ id: number; discordId: string; kind: string; text: string }> {
    return (
      this.db
        .prepare('SELECT id, discord_id, kind, text FROM fan_notifications WHERE sent_at IS NULL AND error IS NULL ORDER BY id LIMIT ?')
        .all(limit) as Row[]
    ).map((r) => ({ id: r.id, discordId: r.discord_id, kind: r.kind, text: r.text }));
  }

  ackNotification(id: number, error: string | null, now = Date.now()): void {
    if (error) this.db.prepare('UPDATE fan_notifications SET error = ? WHERE id = ?').run(error.slice(0, 300), id);
    else this.db.prepare('UPDATE fan_notifications SET sent_at = ? WHERE id = ?').run(now, id);
  }

  notificationStats(since: number): { sent: number; failed: number; pending: number } {
    const r = this.db
      .prepare(
        `SELECT SUM(sent_at IS NOT NULL AND sent_at >= ?) AS sent, SUM(error IS NOT NULL AND created_at >= ?) AS failed,
                SUM(sent_at IS NULL AND error IS NULL) AS pending FROM fan_notifications`,
      )
      .get(since, since) as Row;
    return { sent: r.sent ?? 0, failed: r.failed ?? 0, pending: r.pending ?? 0 };
  }

  /** Commandes livrées pas encore annoncées. */
  deliveredOrders(since: number): ShopOrder[] {
    return this.db
      .prepare("SELECT * FROM shop_orders WHERE status = 'delivered' AND delivered_at >= ? ORDER BY id")
      .all(since)
      .map((r) => toOrder(r as Row));
  }

  // --- Boutique ----------------------------------------------------------------------

  items(opts: { activeOnly?: boolean } = {}): ShopItem[] {
    return this.db
      .prepare(`SELECT * FROM shop_items ${opts.activeOnly ? 'WHERE active = 1' : ''} ORDER BY price, id`)
      .all()
      .map((r) => toItem(r as Row));
  }

  item(id: number): ShopItem | undefined {
    const r = this.db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id);
    return r ? toItem(r as Row) : undefined;
  }

  createItem(input: ItemInput, now = Date.now()): ShopItem {
    const r = this.db
      .prepare(
        'INSERT INTO shop_items (name, description, image_url, price, kind, ref, stock, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      )
      .get(input.name, input.description ?? '', input.imageUrl ?? null, input.price, input.kind, input.ref, input.stock ?? null, input.active === false ? 0 : 1, now);
    return toItem(r as Row);
  }

  updateItem(id: number, input: ItemInput): ShopItem | undefined {
    const r = this.db
      .prepare(
        'UPDATE shop_items SET name = ?, description = ?, image_url = ?, price = ?, kind = ?, ref = ?, stock = ?, active = ? WHERE id = ? RETURNING *',
      )
      .get(input.name, input.description ?? '', input.imageUrl ?? null, input.price, input.kind, input.ref, input.stock ?? null, input.active === false ? 0 : 1, id);
    return r ? toItem(r as Row) : undefined;
  }

  deleteItem(id: number): void {
    this.db.prepare('DELETE FROM shop_items WHERE id = ?').run(id);
  }

  // --- Commandes ---------------------------------------------------------------------

  /** Points dépensés (commandes non remboursées). */
  spent(clipperId: number): number {
    const r = this.db
      .prepare("SELECT COALESCE(SUM(price), 0) AS s FROM shop_orders WHERE clipper_id = ? AND status != 'refunded'")
      .get(clipperId) as Row;
    return r.s;
  }

  spentByClipper(): Map<number, number> {
    const rows = this.db
      .prepare("SELECT clipper_id, SUM(price) AS s FROM shop_orders WHERE status != 'refunded' GROUP BY clipper_id")
      .all() as Row[];
    return new Map(rows.map((r) => [r.clipper_id, r.s]));
  }

  /**
   * Passe une commande si le solde et le stock le permettent (tout ou rien).
   * `earned` = points gagnés grâce aux vues, calculés par le service.
   */
  placeOrder(clipperId: number, itemId: number, earned: number, now = Date.now(), approved = true): ShopOrder {
    return this.db.transaction(() => {
      const item = this.item(itemId);
      if (!item || !item.active) throw new Error('Objet indisponible');
      if (item.stock !== null && item.stock <= 0) throw new Error('Rupture de stock');
      if (earned - this.spent(clipperId) < item.price) throw new Error('Pas assez de points');
      if (item.stock !== null) this.db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ?').run(item.id);
      const r = this.db
        .prepare(
          'INSERT INTO shop_orders (clipper_id, item_id, item_name, kind, ref, price, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
        )
        .get(clipperId, item.id, item.name, item.kind, item.ref, item.price, now, approved ? now : null);
      return toOrder(r as Row);
    })();
  }

  orders(opts: { clipperId?: number; status?: OrderStatus; limit?: number } = {}): ShopOrder[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.clipperId !== undefined) {
      where.push('clipper_id = ?');
      args.push(opts.clipperId);
    }
    if (opts.status) {
      where.push('status = ?');
      args.push(opts.status);
    }
    return this.db
      .prepare(`SELECT * FROM shop_orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...args, opts.limit ?? 500)
      .map((r) => toOrder(r as Row));
  }

  order(id: number): ShopOrder | undefined {
    const r = this.db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(id);
    return r ? toOrder(r as Row) : undefined;
  }

  /** Commandes à livrer dans le jeu pour ce joueur Roblox. */
  pendingForRoblox(robloxUserId: number): ShopOrder[] {
    return this.db
      .prepare(
        "SELECT o.* FROM shop_orders o JOIN clippers c ON c.id = o.clipper_id WHERE c.roblox_user_id = ? AND o.status = 'pending' AND o.approved_at IS NOT NULL ORDER BY o.id",
      )
      .all(robloxUserId)
      .map((r) => toOrder(r as Row));
  }

  /** Marque livrées les commandes de ce joueur (le jeu confirme). Renvoie le nombre mis à jour. */
  /** Commandes à livrer par l'API du jeu (fan relié à Roblox, pas en attente de nouvel essai). */
  pendingForGame(now = Date.now(), limit = 50): Array<ShopOrder & { robloxUserId: number; attempts: number }> {
    return (
      this.db
        .prepare(
          `SELECT o.*, c.roblox_user_id FROM shop_orders o JOIN clippers c ON c.id = o.clipper_id
           WHERE o.status = 'pending' AND o.approved_at IS NOT NULL AND c.roblox_user_id IS NOT NULL AND (o.next_try_at IS NULL OR o.next_try_at <= ?)
           ORDER BY o.id LIMIT ?`,
        )
        .all(now, limit) as Row[]
    ).map((r) => ({ ...toOrder(r), robloxUserId: r.roblox_user_id, attempts: r.attempts }));
  }

  /** Commandes à livrer par e-mail (API du service offert, ex. Squiduuverse). */
  pendingForEmail(now = Date.now(), limit = 50): Array<ShopOrder & { email: string; attempts: number }> {
    return (
      this.db
        .prepare(
          `SELECT o.*, c.reward_email FROM shop_orders o JOIN clippers c ON c.id = o.clipper_id
           WHERE o.status = 'pending' AND o.approved_at IS NOT NULL AND c.reward_email IS NOT NULL AND (o.next_try_at IS NULL OR o.next_try_at <= ?)
           ORDER BY o.id LIMIT ?`,
        )
        .all(now, limit) as Row[]
    ).map((r) => ({ ...toOrder(r), email: r.reward_email, attempts: r.attempts }));
  }

  deliveryFailed(orderId: number, error: string, nextTryAt: number): void {
    this.db.prepare('UPDATE shop_orders SET attempts = attempts + 1, delivery_error = ?, next_try_at = ? WHERE id = ?').run(error, nextTryAt, orderId);
  }

  markDelivered(orderIds: readonly number[], robloxUserId: number | null, now = Date.now()): number {
    let n = 0;
    const stmt =
      robloxUserId === null
        ? // Livré à la main par le staff : vaut validation
          this.db.prepare("UPDATE shop_orders SET status = 'delivered', delivered_at = @at, approved_at = COALESCE(approved_at, @at) WHERE id = @id AND status = 'pending'")
        : this.db.prepare(
            "UPDATE shop_orders SET status = 'delivered', delivered_at = @at WHERE id = @id AND status = 'pending' AND approved_at IS NOT NULL AND clipper_id IN (SELECT id FROM clippers WHERE roblox_user_id = @rbx)",
          );
    for (const id of orderIds) n += (robloxUserId === null ? stmt.run({ at: now, id }) : stmt.run({ at: now, id, rbx: robloxUserId })).changes;
    return n;
  }

  /** Achat validé par le staff : la livraison peut partir. */
  approve(orderId: number, now = Date.now()): boolean {
    return this.db.prepare("UPDATE shop_orders SET approved_at = ? WHERE id = ? AND status = 'pending' AND approved_at IS NULL").run(now, orderId).changes > 0;
  }

  discordIdOf(clipperId: number): string | null {
    const id = (this.db.prepare('SELECT discord_id FROM clippers WHERE id = ?').get(clipperId) as Row | undefined)?.discord_id as string | undefined;
    return id && !id.startsWith('manual:') ? id : null;
  }

  /** Achats en attente de validation (alerte staff). */
  toApprove(): ShopOrder[] {
    return this.db.prepare("SELECT * FROM shop_orders WHERE status = 'pending' AND approved_at IS NULL ORDER BY id").all().map((r) => toOrder(r as Row));
  }

  /** Rembourse une commande non livrée : les points reviennent, le stock aussi. */
  refund(orderId: number): boolean {
    return this.db.transaction(() => {
      const o = this.order(orderId);
      if (!o || o.status !== 'pending') return false;
      this.db.prepare("UPDATE shop_orders SET status = 'refunded' WHERE id = ?").run(orderId);
      if (o.itemId) this.db.prepare('UPDATE shop_items SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL').run(o.itemId);
      return true;
    })();
  }
}
