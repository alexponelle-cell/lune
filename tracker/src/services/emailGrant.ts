import type { FanRepo } from '../db/fans.js';
import { orderIdFor } from './game.js';

type FetchFn = typeof fetch;
const MIN = 60_000;

/**
 * API de livraison par e-mail (ex. Squiduuverse : « +1 mois au compte de cet e-mail ») :
 *   POST {base}/grant  { email, months, orderId }  · Authorization: Bearer <token>
 *   200 = ajouté (même orderId renvoyé = pas de 2e don) · 404 user_not_found · 401 token refusé
 */
export class EmailGrantClient {
  private readonly token: string;

  constructor(
    private readonly baseUrl: string,
    token: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.token = token.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
  }

  async grant(email: string, months: number, orderId: string): Promise<{ delivered: boolean; status: number; code?: string; message?: string; retryAfter?: number }> {
    const res = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}/grant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, months, orderId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { delivered: true, status: res.status };
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; retryAfter?: number };
    const retryAfter = Number(body.retryAfter ?? res.headers.get('retry-after'));
    return { delivered: false, status: res.status, code: body.error, message: body.message, retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined };
  }
}

/** Nombre de mois d'un objet de la boutique (référence « …-3m » = 3 mois, 1 par défaut). */
export const monthsOf = (ref: string) => Number(ref.match(/(\d+)m$/i)?.[1] ?? 1) || 1;

/** Envoie les commandes en attente à l'API (fans avec un e-mail de livraison). */
export async function deliverEmailOrders(api: EmailGrantClient, fans: FanRepo, now = Date.now()) {
  let delivered = 0;
  let failed = 0;
  for (const o of fans.pendingForEmail(now)) {
    try {
      const r = await api.grant(o.email, monthsOf(o.ref), orderIdFor(o));
      if (r.delivered) {
        fans.markDelivered([o.id], null, now);
        delivered++;
        continue;
      }
      failed++;
      const why = `${r.code ?? `HTTP ${r.status}`}${r.message ? ` : ${r.message}` : ''}`;
      if (r.status === 401 || r.status === 403) {
        fans.deliveryFailed(o.id, `Clé de l'API refusée (${why}) : vérifie la clé dans Railway`, now + 30 * MIN);
        break;
      }
      if (r.status === 429) {
        fans.deliveryFailed(o.id, `Limite de l'API atteinte, nouvel essai dans ${Math.ceil((r.retryAfter ?? 60) / 60)} min`, now + Math.max(60, r.retryAfter ?? 60) * 1000);
        break;
      }
      if (r.status === 404 || r.code === 'user_not_found') {
        // Le clippeur peut créer son compte ou corriger son e-mail : on réessaie de temps en temps
        fans.deliveryFailed(o.id, `Aucun compte avec l'e-mail ${o.email} : le clippeur doit créer son compte ou corriger son e-mail`, now + 6 * 60 * MIN);
        continue;
      }
      fans.deliveryFailed(o.id, `Échec (${why}), nouvel essai automatique`, now + Math.min(60, 2 ** o.attempts) * MIN);
    } catch (err) {
      failed++;
      fans.deliveryFailed(o.id, `API injoignable (${err instanceof Error ? err.message : String(err)}), nouvel essai automatique`, now + Math.min(60, 2 ** o.attempts) * MIN);
    }
  }
  return { livrées: delivered, échecs: failed };
}
