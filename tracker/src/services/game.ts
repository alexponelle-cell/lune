import type { FanRepo } from '../db/fans.js';

/** Produit vendu dans le jeu (catalogue exposé par le serveur du jeu). */
export interface GameProduct {
  id: number;
  type: 'gamepass' | 'devproduct';
  name: string;
  description: string;
  imageUrl: string | null;
  priceRobux: number | null;
  /** Dons encore possibles pour ce produit (null = pas de plafond). */
  remaining: number | null;
}

type FetchFn = typeof fetch;
const MIN = 60_000;

/**
 * Client de l'API du jeu Roblox (serveur du dev du jeu) :
 *   GET  {base}/products → catalogue
 *   POST {base}/grant    → { userId, productId, orderId, type } ; 200 ok (même si replayed) · sinon { error, message }
 */
export class GameClient {
  private readonly token: string;

  constructor(
    private readonly baseUrl: string,
    token: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    // Valeur collée dans Railway : espaces, guillemets ou « Bearer » en trop ne doivent pas casser l'accès
    this.token = token.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
  }

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
        remaining: p.remaining == null ? null : Number(p.remaining),
      }));
  }

  /**
   * POST /grant. L'orderId identifie CE don : renvoyé tel quel à chaque essai, le serveur du jeu ne donne jamais deux fois.
   * Réponse 200 (replayed ou non) = don réussi. Sinon : code d'erreur de l'API ({ error, message, retryAfter? }).
   */
  async grant(userId: number, productId: number, orderId: string, type?: 'gamepass' | 'devproduct'): Promise<{ delivered: boolean; status: number; code?: string; message?: string; retryAfter?: number }> {
    const res = await this.fetchFn(this.url('/grant'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ userId, productId, orderId, ...(type ? { type } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { delivered: true, status: res.status };
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; retryAfter?: number };
    const retryAfter = Number(body.retryAfter ?? res.headers.get('retry-after'));
    return { delivered: false, status: res.status, code: body.error, message: body.message, retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined };
  }
}

/** orderId stable d'une commande : le même à chaque nouvel essai, jamais réutilisé pour un autre don. */
export const orderIdFor = (o: { id: number; createdAt: number }) => `order-${o.id}-${o.createdAt}`;

/** Envoie au jeu les commandes en attente. S'arrête au premier rate limit (429) ou problème de token. */
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
      const r = await game.grant(o.robloxUserId, productId, orderIdFor(o), o.kind === 'gamepass' ? 'gamepass' : 'devproduct');
      if (r.delivered) {
        fans.markDelivered([o.id], null, now);
        delivered++;
        continue;
      }
      failed++;
      const why = `${r.code ?? `HTTP ${r.status}`}${r.message ? ` : ${r.message}` : ''}`;
      const NEVER = now + 100 * 365 * 24 * 60 * MIN;
      const backoff = now + Math.min(60, 2 ** o.attempts) * MIN;
      switch (r.code) {
        case 'rate_limited':
          fans.deliveryFailed(o.id, `Limite du jeu atteinte, nouvel essai dans ${Math.ceil((r.retryAfter ?? 60) / 60)} min`, now + Math.max(60, r.retryAfter ?? 60) * 1000);
          return { livrées: delivered, échecs: failed };
        case 'unauthorized':
        case 'client_disabled':
          // Problème de token : inutile d'insister sur les autres commandes
          fans.deliveryFailed(o.id, `Token du jeu refusé (${why}) : vérifie GAME_API_TOKEN`, now + 30 * MIN);
          return { livrées: delivered, échecs: failed };
        case 'order_in_progress':
          fans.deliveryFailed(o.id, 'Don en cours côté jeu, vérification dans 1 min', now + MIN);
          break;
        case 'already_owned':
          fans.deliveryFailed(o.id, 'Le joueur possède déjà ce gamepass : rembourse la commande', NEVER);
          break;
        case 'product_limit_reached':
          fans.deliveryFailed(o.id, 'Plafond du produit atteint côté jeu : rembourse et retire l’objet de la boutique', NEVER);
          break;
        case 'order_conflict':
          fans.deliveryFailed(o.id, `Conflit de commande (${why}) : préviens le développeur`, NEVER);
          break;
        case 'user_not_found':
        case 'product_not_found':
          fans.deliveryFailed(o.id, why, now + 6 * 60 * MIN);
          break;
        case 'queue_full':
          fans.deliveryFailed(o.id, 'Le joueur a trop de dons en attente : nouvel essai dans 1 h', now + 60 * MIN);
          break;
        default:
          fans.deliveryFailed(o.id, why, backoff);
      }
    } catch (err) {
      failed++;
      fans.deliveryFailed(o.id, `Serveur du jeu injoignable : ${err instanceof Error ? err.message : String(err)}`, now + Math.min(60, 2 ** o.attempts) * MIN);
    }
  }
  return { livrées: delivered, échecs: failed };
}
