import type { FanRepo } from '../db/fans.js';

/** Produit vendu dans le jeu (catalogue exposé par le serveur du jeu). */
export interface GameProduct {
  id: number;
  type: 'gamepass' | 'devproduct';
  name: string;
  description: string;
  imageUrl: string | null;
  priceRobux: number | null;
}

type FetchFn = typeof fetch;
const MIN = 60_000;

/**
 * Client de l'API du jeu Roblox (serveur du dev du jeu) :
 *   GET  {base}/products → catalogue
 *   POST {base}/grant    → { userId, productId, orderId } ; 200 ok · 409 déjà possédé · 404 inconnu · 429 rate limit
 */
export class GameClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  private headers() {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  async products(): Promise<GameProduct[]> {
    const res = await this.fetchFn(this.url('/products'), { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Serveur du jeu : HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    const list = Array.isArray(body) ? body : ((body as { products?: unknown[] })?.products ?? []);
    return list
      .map((p) => p as Record<string, unknown>)
      .filter((p) => p && Number.isFinite(Number(p.id)))
      .map((p) => ({
        id: Number(p.id),
        type: p.type === 'devproduct' ? 'devproduct' : 'gamepass',
        name: String(p.name ?? `Produit ${p.id}`),
        description: String(p.description ?? ''),
        imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : null,
        priceRobux: p.priceRobux == null ? null : Number(p.priceRobux),
      }));
  }

  /** Donne un produit ; `delivered` = le jeu l'a pris en charge (ou le joueur l'avait déjà). */
  async grant(userId: number, productId: number, orderId: number): Promise<{ delivered: boolean; status: number; error?: string }> {
    const res = await this.fetchFn(this.url('/grant'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ userId, productId, orderId: String(orderId) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 409) return { delivered: true, status: res.status };
    const text = (await res.text().catch(() => '')).slice(0, 200);
    return { delivered: false, status: res.status, error: `HTTP ${res.status}${text ? ` : ${text}` : ''}` };
  }
}

/** Envoie au jeu les commandes en attente. S'arrête au premier rate limit (429). */
export async function deliverPendingOrders(game: GameClient, fans: FanRepo, now = Date.now()) {
  let delivered = 0;
  let failed = 0;
  for (const o of fans.pendingForGame(now)) {
    const productId = Number(o.ref);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      fans.deliveryFailed(o.id, `Référence jeu « ${o.ref} » : un ID numérique est attendu`, now + 60 * MIN);
      failed++;
      continue;
    }
    try {
      const r = await game.grant(o.robloxUserId, productId, o.id);
      if (r.delivered) {
        fans.markDelivered([o.id], null, now);
        delivered++;
        continue;
      }
      failed++;
      if (r.status === 429) {
        fans.deliveryFailed(o.id, 'Limite du jeu atteinte, nouvel essai dans 1 min', now + MIN);
        break;
      }
      // 404 (joueur / produit inconnu) : peu de chances que ça change vite
      const wait = r.status === 404 ? 6 * 60 * MIN : Math.min(60, 2 ** o.attempts) * MIN;
      fans.deliveryFailed(o.id, r.error ?? `HTTP ${r.status}`, now + wait);
    } catch (err) {
      failed++;
      fans.deliveryFailed(o.id, `Serveur du jeu injoignable : ${err instanceof Error ? err.message : String(err)}`, now + Math.min(60, 2 ** o.attempts) * MIN);
    }
  }
  return { livrées: delivered, échecs: failed };
}
