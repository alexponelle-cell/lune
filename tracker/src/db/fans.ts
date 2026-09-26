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
  clipperByRoblox(userId: number): number | null {
    const r = this.db.prepare('SELECT id FROM clippers WHERE roblox_user_id = ?').get(userId) as Row | undefined;
    return r ? r.id : null;
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
  placeOrder(clipperId: number, itemId: number, earned: number, now = Date.now()): ShopOrder {
    return this.db.transaction(() => {
      const item = this.item(itemId);
      if (!item || !item.active) throw new Error('Objet indisponible');
      if (item.stock !== null && item.stock <= 0) throw new Error('Rupture de stock');
      if (earned - this.spent(clipperId) < item.price) throw new Error('Pas assez de points');
      if (item.stock !== null) this.db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ?').run(item.id);
      const r = this.db
        .prepare(
          'INSERT INTO shop_orders (clipper_id, item_id, item_name, kind, ref, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
        )
        .get(clipperId, item.id, item.name, item.kind, item.ref, item.price, now);
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
        "SELECT o.* FROM shop_orders o JOIN clippers c ON c.id = o.clipper_id WHERE c.roblox_user_id = ? AND o.status = 'pending' ORDER BY o.id",
      )
      .all(robloxUserId)
      .map((r) => toOrder(r as Row));
  }

  /** Marque livrées les commandes de ce joueur (le jeu confirme). Renvoie le nombre mis à jour. */
  markDelivered(orderIds: readonly number[], robloxUserId: number | null, now = Date.now()): number {
    let n = 0;
    const stmt =
      robloxUserId === null
        ? this.db.prepare("UPDATE shop_orders SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'pending'")
        : this.db.prepare(
            "UPDATE shop_orders SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'pending' AND clipper_id IN (SELECT id FROM clippers WHERE roblox_user_id = ?)",
          );
    for (const id of orderIds) n += (robloxUserId === null ? stmt.run(now, id) : stmt.run(now, id, robloxUserId)).changes;
    return n;
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
