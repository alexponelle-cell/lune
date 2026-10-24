import type { Hub } from '../db.js';
import type { TxInput } from '../domain/money.js';

/**
 * Qonto (API officielle, gratuite, lecture seule) : Adrien crée une clé dans Qonto
 * (Paramètres → Intégrations et partenaires → Clé API) et colle « identifiant » + « clé secrète » dans le hub.
 * On ne fait que lire les mouvements : aucun virement possible avec cette clé.
 */
const API = 'https://thirdparty.qonto.com/v2';
type Json = Record<string, any>;

export class Qonto {
  constructor(private login: string, private secret: string, private fetchImpl: typeof fetch = fetch) {}
  private async get(path: string, params: Record<string, string | string[]> = {}): Promise<Json> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
    const r = await this.fetchImpl(`${API}${path}${q.size ? `?${q}` : ''}`, { headers: { authorization: `${this.login}:${this.secret}`, accept: 'application/json' } });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (!r.ok) throw new Error(r.status === 401 ? 'Identifiants Qonto refusés : vérifie l’identifiant et la clé secrète' : `Qonto : ${j.message ?? j.errors?.[0]?.detail ?? r.status}`);
    return j;
  }

  /** Mouvements passés de tous les comptes depuis `since` (date ISO). */
  async transactions(since: string): Promise<Array<TxInput & { id: string }>> {
    const org = await this.get('/organization');
    const accounts = (org.organization?.bank_accounts ?? []) as Json[];
    const out: Array<TxInput & { id: string }> = [];
    for (const acc of accounts) {
      for (let page = 1; page <= 50; page++) {
        const j = await this.get('/transactions', { ...(acc.id ? { bank_account_id: acc.id } : { iban: acc.iban }), 'status[]': ['completed'], settled_at_from: since, per_page: '100', current_page: String(page) });
        for (const t of (j.transactions ?? []) as Json[]) {
          const amount = Number(t.amount) * (t.side === 'debit' ? -1 : 1);
          const date = String(t.settled_at ?? t.emitted_at ?? '').slice(0, 10);
          if (!date || !Number.isFinite(amount)) continue;
          out.push({ id: String(t.transaction_id ?? t.id), date, label: [t.label, t.reference].filter(Boolean).join(' ').trim() || 'Mouvement Qonto', amount });
        }
        if (!j.meta?.next_page) break;
      }
    }
    return out;
  }
}

/** Importe les mouvements Qonto des 4 derniers mois (sans doublons, rangés automatiquement). */
export async function syncQonto(hub: Hub, qonto: Qonto, now = Date.now()): Promise<{ added: number; total: number }> {
  const rows = await qonto.transactions(new Date(now - 120 * 86_400_000).toISOString());
  const added = hub.importTx(rows, 'qonto');
  hub.setSetting('qonto_last_sync', String(now));
  return { added, total: rows.length };
}
