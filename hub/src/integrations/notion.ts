import type { Hub, Status } from '../db.js';
import { norm } from '../domain/money.js';

/**
 * Synchro Notion (API officielle, gratuite). Adrien crée une intégration « interne » dans Notion, colle sa clé dans le hub,
 * puis partage ses pages clients avec l'intégration. On trouve tout seul ses bases de vidéos (une par client / réseau) :
 * le client = le titre de la page qui contient la base, le statut = la propriété dont les options ressemblent à son process.
 */
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

/** Étape Notion (« Monté à valider », « À filmer »…) → statut du hub. L'ordre des tests compte. */
export function mapStatus(name: string): Status | null {
  const s = norm(name).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/publi/.test(s)) return 'publie';
  if (/planifi|programm/.test(s)) return 'planifie';
  if (/(monte|montage).*valid|a valider|en validation|review/.test(s)) return 'avalider';
  if (/modif|retour|correction/.test(s)) return 'modif';
  if (/^valid|^ok\b|approuv/.test(s)) return 'valide';
  if (/montage|^a monte|^a monter|editing|^monte$/.test(s)) return 'montage';
  if (/a filmer|a tourner|to film/.test(s)) return 'afilmer';
  if (/filme|tourne|shoot/.test(s)) return 'filme';
  if (/script|ecri|redac/.test(s)) return 'script';
  if (/idee|idea|backlog/.test(s)) return 'idee';
  return null;
}

export interface DbMap { id: string; client: string; title: string; statusProp: string; statusType: 'status' | 'select'; options: Record<string, string>; tagProp: string | null; dateProp: string | null; peopleProp: string | null }
type Json = Record<string, any>;

export class Notion {
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}
  private async call(path: string, body?: Json, method = body ? 'POST' : 'GET'): Promise<Json> {
    const r = await this.fetchImpl(`${API}${path}`, { method, headers: { authorization: `Bearer ${this.token}`, 'notion-version': VERSION, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (!r.ok) throw new Error(r.status === 401 ? 'Clé Notion refusée : vérifie-la' : `Notion : ${j.message ?? r.status}`);
    return j;
  }
  private async all(path: string, body: Json = {}): Promise<Json[]> {
    const out: Json[] = []; let cursor: string | undefined;
    do { const j = await this.call(path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); out.push(...(j.results ?? [])); cursor = j.has_more ? j.next_cursor : undefined; } while (cursor);
    return out;
  }
  private titleOf = (rich: Json[] | undefined) => (rich ?? []).map((t) => t.plain_text ?? '').join('').trim();

  /** Trouve les bases de vidéos partagées avec l'intégration et devine leurs propriétés. */
  async discover(): Promise<DbMap[]> {
    const dbs = await this.all('/search', { filter: { property: 'object', value: 'database' } });
    const out: DbMap[] = [];
    for (const db of dbs) {
      const props = Object.entries((db.properties ?? {}) as Record<string, Json>);
      // Propriété de statut : celle dont le plus d'options ressemblent aux étapes du process
      let best: { name: string; type: 'status' | 'select'; options: Record<string, string>; score: number } | null = null;
      for (const [name, p] of props) {
        if (p.type !== 'status' && p.type !== 'select') continue;
        const opts = (p[p.type]?.options ?? []) as Json[];
        const options: Record<string, string> = {};
        opts.forEach((o) => { const st = mapStatus(o.name); if (st && !options[st]) options[st] = o.name; });
        const score = Object.keys(options).length;
        if (score >= 3 && (!best || score > best.score)) best = { name, type: p.type, options, score };
      }
      if (!best) continue;
      const tag = props.find(([, p]) => (p.type === 'select' || p.type === 'multi_select') && ((p[p.type]?.options ?? []) as Json[]).some((o) => /^(tofu|mofu|bofu)$/i.test(o.name)));
      const date = props.find(([n, p]) => p.type === 'date' && /publi|post|diffus|planif|date/i.test(n)) ?? props.find(([, p]) => p.type === 'date');
      const people = props.find(([n, p]) => p.type === 'people' && /mont|edit|assign|respons/i.test(n)) ?? props.find(([, p]) => p.type === 'people');
      let client = '';
      if (db.parent?.type === 'page_id') {
        try { const page = await this.call(`/pages/${db.parent.page_id}`); const tp = Object.values((page.properties ?? {}) as Record<string, Json>).find((p) => p.type === 'title'); client = this.titleOf(tp?.title); } catch { /* page non partagée */ }
      }
      const title = this.titleOf(db.title);
      out.push({ id: db.id, client: client || title || 'Client', title, statusProp: best.name, statusType: best.type, options: best.options, tagProp: tag?.[0] ?? null, dateProp: date?.[0] ?? null, peopleProp: people?.[0] ?? null });
    }
    return out;
  }

  /** Lit toutes les vidéos d'une base. */
  async pages(m: DbMap): Promise<Array<{ id: string; title: string; status: Status | null; tag: string | null; date: number | null; person: string | null; url: string | null }>> {
    const rows = await this.all(`/databases/${m.id}/query`);
    return rows.filter((r) => !r.archived && !r.in_trash).map((r) => {
      const p = r.properties as Record<string, Json>;
      const titleProp = Object.values(p).find((x) => x.type === 'title');
      const st = p[m.statusProp]?.[m.statusType]?.name as string | undefined;
      const tagV = m.tagProp ? p[m.tagProp] : undefined;
      const tag = tagV?.type === 'multi_select' ? tagV.multi_select?.[0]?.name : tagV?.select?.name;
      const d = m.dateProp ? p[m.dateProp]?.date?.start : null;
      const person = m.peopleProp ? p[m.peopleProp]?.people?.[0]?.name ?? null : null;
      return { id: r.id as string, title: this.titleOf(titleProp?.title) || 'Sans titre', status: st ? mapStatus(st) : null, tag: tag ?? null, date: d ? Date.parse(d) : null, person, url: r.url ?? null };
    });
  }

  /** Change l'étape d'une vidéo dans Notion (ex. « Validé » quand le client valide dans le hub). */
  async setStatus(pageId: string, m: DbMap, status: Status) {
    const name = m.options[status];
    if (!name) return false;
    await this.call(`/pages/${pageId}`, { properties: { [m.statusProp]: { [m.statusType]: { name } } } }, 'PATCH');
    return true;
  }

  /** Ajoute un commentaire sur la page (demande de modif du client). Facultatif : nécessite le droit « commentaires ». */
  async comment(pageId: string, text: string) {
    try { await this.call('/comments', { parent: { page_id: pageId }, rich_text: [{ text: { content: text.slice(0, 1900) } }] }); } catch { /* droit absent : on ignore */ }
  }
}

/** Synchro Notion → hub : crée / met à jour les clients, monteurs et vidéos. Renvoie un résumé. */
export async function syncNotion(hub: Hub, notion: Notion, now = Date.now()): Promise<{ bases: number; created: number; updated: number }> {
  const maps = await notion.discover();
  hub.setSetting('notion_dbs', JSON.stringify(maps));
  let created = 0, updated = 0;
  const clientId = (name: string) => (hub.clients().find((c) => norm(c.name).toLowerCase() === norm(name).toLowerCase()) ?? hub.addClient(name, 0, '#FCCA09')).id;
  const monteurId = (name: string | null) => (name ? (hub.monteurs().find((m) => norm(m.name).toLowerCase() === norm(name).toLowerCase()) ?? hub.addMonteur(name, 0)).id : null);
  for (const m of maps) {
    const cid = clientId(m.client);
    for (const pg of await notion.pages(m)) {
      if (!pg.status) continue;
      const v = hub.db.prepare('SELECT * FROM videos WHERE notion_id = ?').get(pg.id) as { id: number; status: Status } | undefined;
      const mid = monteurId(pg.person);
      if (!v) {
        hub.addVideo({ client_id: cid, title: pg.title, status: pg.status, tag: pg.tag, monteur_id: mid, notion_id: pg.id, notion_db: m.id, url: pg.url,
          sent_at: pg.status === 'avalider' ? now : null, validated_at: ['valide', 'planifie', 'publie'].includes(pg.status) ? now : null,
          planned_at: pg.status === 'planifie' ? pg.date : null, published_at: pg.status === 'publie' ? pg.date ?? now : null }, now);
        created++;
        continue;
      }
      hub.db.prepare('UPDATE videos SET title = ?, tag = COALESCE(?, tag), monteur_id = COALESCE(?, monteur_id), client_id = ?, url = COALESCE(?, url), notion_db = ?, planned_at = CASE WHEN ? IS NOT NULL AND ? = \'planifie\' THEN ? ELSE planned_at END, updated_at = ? WHERE id = ?')
        .run(pg.title, pg.tag, mid, cid, pg.url, m.id, pg.date, pg.status, pg.date, now, v.id);
      if (v.status !== pg.status) {
        hub.setStatus(v.id, pg.status, now);
        if (pg.status === 'valide' && !(hub.video(v.id)!.validated_at)) hub.db.prepare('UPDATE videos SET validated_at = ? WHERE id = ?').run(now, v.id);
        if (pg.status === 'publie' && pg.date) hub.db.prepare('UPDATE videos SET published_at = ? WHERE id = ?').run(pg.date, v.id);
        updated++;
      }
    }
  }
  hub.setSetting('notion_last_sync', String(now));
  return { bases: maps.length, created, updated };
}

/** Base Notion d'une vidéo (pour écrire son nouveau statut). */
export function mapOfDb(hub: Hub, dbId: string | null): DbMap | undefined {
  if (!dbId) return undefined;
  return (JSON.parse(hub.setting('notion_dbs') ?? '[]') as DbMap[]).find((m) => m.id === dbId);
}
