import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { classify, learnKey, type Cat, type TxInput } from './domain/money.js';

/** Migrations numérotées : toujours en ajouter une, ne jamais modifier une ancienne. */
const MIGRATIONS = [
  `CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, fee REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#FCCA09', token TEXT NOT NULL UNIQUE, instagram TEXT, active INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE monteurs (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, rate REAL NOT NULL DEFAULT 0, slack TEXT, active INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE tournages (id INTEGER PRIMARY KEY, code TEXT NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id), date INTEGER NOT NULL, hours REAL NOT NULL DEFAULT 2, spot_name TEXT, spot_place TEXT, spot_price REAL);
   CREATE TABLE videos (id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), title TEXT NOT NULL, status TEXT NOT NULL, tag TEXT, monteur_id INTEGER REFERENCES monteurs(id), tournage_id INTEGER REFERENCES tournages(id),
     due_at INTEGER, sent_at INTEGER, reminded_at INTEGER, validated_at INTEGER, planned_at INTEGER, published_at INTEGER, views INTEGER NOT NULL DEFAULT 0, url TEXT, comment TEXT, notion_id TEXT UNIQUE, updated_at INTEGER NOT NULL);
   CREATE TABLE transactions (id INTEGER PRIMARY KEY, date TEXT NOT NULL, label TEXT NOT NULL, amount REAL NOT NULL, cat TEXT NOT NULL, who TEXT, source TEXT NOT NULL DEFAULT 'csv', ext_id TEXT UNIQUE);
   CREATE TABLE learned (key TEXT PRIMARY KEY, cat TEXT NOT NULL);
   CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, who TEXT, text TEXT NOT NULL, auto INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2 : base Notion d'origine de chaque vidéo (un client peut avoir une base Instagram et une base YouTube)
  `ALTER TABLE videos ADD COLUMN notion_db TEXT;`,
  // v3 : e-mail du client (relances), lien de la vidéo à regarder, statut à renvoyer dans Notion si l'envoi a raté
  `ALTER TABLE clients ADD COLUMN email TEXT;
   ALTER TABLE videos ADD COLUMN video_url TEXT;
   ALTER TABLE videos ADD COLUMN notion_push TEXT;`,
];

export const STATUSES = ['idee', 'script', 'afilmer', 'filme', 'montage', 'avalider', 'modif', 'valide', 'planifie', 'publie'] as const;
export type Status = (typeof STATUSES)[number];

export interface Client { id: number; name: string; fee: number; color: string; token: string; instagram: string | null; email: string | null }
export interface Monteur { id: number; name: string; rate: number; slack: string | null }
export interface Video { id: number; client_id: number; title: string; status: Status; tag: string | null; monteur_id: number | null; tournage_id: number | null; due_at: number | null; sent_at: number | null; reminded_at: number | null; validated_at: number | null; planned_at: number | null; published_at: number | null; views: number; url: string | null; comment: string | null; notion_id: string | null; notion_db: string | null; video_url: string | null; notion_push: string | null }
export interface Tournage { id: number; code: string; client_id: number; date: number; hours: number; spot_name: string | null; spot_place: string | null; spot_price: number | null }
export interface Tx { id: number; date: string; label: string; amount: number; cat: Cat; who: string | null; source: string }
export interface Event { id: number; at: number; kind: string; who: string | null; text: string; auto: number }

export const UNDO_MS = 15 * 60_000;

export class Hub {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const v = this.db.pragma('user_version', { simple: true }) as number;
    MIGRATIONS.slice(v).forEach((sql, i) => this.db.transaction(() => { this.db.exec(sql); this.db.pragma(`user_version = ${v + i + 1}`); })());
  }

  // --- Lecture -----------------------------------------------------------------
  clients = () => this.db.prepare('SELECT id, name, fee, color, token, instagram, email FROM clients WHERE active = 1 ORDER BY id').all() as Client[];
  clientByToken = (token: string) => this.db.prepare('SELECT id, name, fee, color, token, instagram, email FROM clients WHERE token = ? AND active = 1').get(token) as Client | undefined;
  monteurs = () => this.db.prepare('SELECT id, name, rate, slack FROM monteurs WHERE active = 1 ORDER BY id').all() as Monteur[];
  videos = (clientId?: number) => (clientId ? this.db.prepare('SELECT * FROM videos WHERE client_id = ? ORDER BY id').all(clientId) : this.db.prepare('SELECT * FROM videos ORDER BY id').all()) as Video[];
  video = (id: number) => this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;
  tournages = () => this.db.prepare('SELECT * FROM tournages ORDER BY date').all() as Tournage[];
  transactions = () => this.db.prepare('SELECT id, date, label, amount, cat, who, source FROM transactions ORDER BY date').all() as Tx[];
  events = (limit = 60) => this.db.prepare('SELECT * FROM events ORDER BY at DESC LIMIT ?').all(limit) as Event[];
  setting = (key: string) => (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
  setSetting = (key: string, value: string) => this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
  learned = () => Object.fromEntries((this.db.prepare('SELECT key, cat FROM learned').all() as Array<{ key: string; cat: Cat }>).map((r) => [r.key, r.cat]));

  // --- Écriture ------------------------------------------------------------------
  addClient(name: string, fee: number, color = '#FCCA09', instagram: string | null = null, email: string | null = null): Client {
    const token = randomBytes(12).toString('base64url');
    const r = this.db.prepare('INSERT INTO clients (name, fee, color, token, instagram, email) VALUES (?, ?, ?, ?, ?, ?)').run(name, fee, color, token, instagram, email);
    return { id: Number(r.lastInsertRowid), name, fee, color, token, instagram, email };
  }
  updateClient(id: number, c: { name: string; fee: number; color: string; instagram: string | null; email: string | null }) {
    if (!this.db.prepare('UPDATE clients SET name = @name, fee = @fee, color = @color, instagram = @instagram, email = @email WHERE id = @id AND active = 1').run({ ...c, id }).changes) throw new Error('Client introuvable');
  }
  updateMonteur(id: number, m: { name: string; rate: number; slack: string | null }) {
    if (!this.db.prepare('UPDATE monteurs SET name = @name, rate = @rate, slack = @slack WHERE id = @id AND active = 1').run({ ...m, id }).changes) throw new Error('Monteur introuvable');
  }
  /** Retire un client ou un monteur (gardé en base pour l'historique de la compta). */
  archive(table: 'clients' | 'monteurs', id: number) { this.db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ?`).run(id); }
  addTournageFor(clientId: number, date: number, hours: number) {
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM tournages WHERE client_id = ?').get(clientId) as { n: number }).n;
    return this.addTournage({ code: `T${n + 1}`, client_id: clientId, date, hours, spot_name: null, spot_place: null, spot_price: null });
  }
  addMonteur(name: string, rate: number, slack: string | null = null): Monteur {
    const r = this.db.prepare('INSERT INTO monteurs (name, rate, slack) VALUES (?, ?, ?)').run(name, rate, slack);
    return { id: Number(r.lastInsertRowid), name, rate, slack };
  }
  addTournage(t: Omit<Tournage, 'id'>): number {
    return Number(this.db.prepare('INSERT INTO tournages (code, client_id, date, hours, spot_name, spot_place, spot_price) VALUES (@code, @client_id, @date, @hours, @spot_name, @spot_place, @spot_price)').run(t).lastInsertRowid);
  }
  addVideo(v: Partial<Video> & { client_id: number; title: string; status: Status }, now = Date.now()): number {
    const row = { tag: null, monteur_id: null, tournage_id: null, due_at: null, sent_at: null, reminded_at: null, validated_at: null, planned_at: null, published_at: null, views: 0, url: null, comment: null, notion_id: null, notion_db: null, video_url: null, ...v, updated_at: now };
    return Number(this.db.prepare(`INSERT INTO videos (client_id, title, status, tag, monteur_id, tournage_id, due_at, sent_at, reminded_at, validated_at, planned_at, published_at, views, url, comment, notion_id, notion_db, video_url, updated_at)
      VALUES (@client_id, @title, @status, @tag, @monteur_id, @tournage_id, @due_at, @sent_at, @reminded_at, @validated_at, @planned_at, @published_at, @views, @url, @comment, @notion_id, @notion_db, @video_url, @updated_at)`).run(row).lastInsertRowid);
  }
  log(kind: string, text: string, who: string | null = null, auto = true, at = Date.now()) {
    this.db.prepare('INSERT INTO events (at, kind, who, text, auto) VALUES (?, ?, ?, ?, ?)').run(at, kind, who, text, auto ? 1 : 0);
  }

  /** Le client valide : la vidéo passe à « Validé » (et sa paie compte pour le monteur ce mois-ci). */
  validate(id: number, now = Date.now()): Video {
    const v = this.video(id);
    if (!v) throw new Error('Vidéo introuvable');
    if (v.status !== 'avalider' && v.status !== 'modif') throw new Error('Cette vidéo n’est pas en attente de validation');
    this.db.prepare("UPDATE videos SET status = 'valide', validated_at = ?, comment = NULL, updated_at = ? WHERE id = ?").run(now, now, id);
    return this.video(id)!;
  }
  /** Le client demande une modif : retour au monteur avec sa remarque. */
  requestChange(id: number, comment: string, now = Date.now()): Video {
    const v = this.video(id);
    if (!v) throw new Error('Vidéo introuvable');
    if (v.status !== 'avalider') throw new Error('Cette vidéo n’est pas en attente de validation');
    this.db.prepare("UPDATE videos SET status = 'modif', comment = ?, updated_at = ? WHERE id = ?").run(comment.slice(0, 500), now, id);
    return this.video(id)!;
  }
  /** Validée → planifiée à une date de publication. */
  plan(id: number, at: number, now = Date.now()): Video {
    const v = this.video(id);
    if (!v) throw new Error('Vidéo introuvable');
    if (v.status !== 'valide' && v.status !== 'planifie') throw new Error('La vidéo doit être validée avant d’être planifiée');
    this.db.prepare("UPDATE videos SET status = 'planifie', planned_at = ?, updated_at = ? WHERE id = ?").run(at, now, id);
    return this.video(id)!;
  }
  /** Clic par erreur : une validation peut être annulée pendant 15 minutes (la paie du monteur est retirée). */
  undoValidate(id: number, now = Date.now()): Video {
    const v = this.video(id);
    if (!v || v.status !== 'valide' || !v.validated_at || now - v.validated_at > UNDO_MS) throw new Error('Trop tard pour annuler : écris à l’équipe');
    this.db.prepare("UPDATE videos SET status = 'avalider', validated_at = NULL, updated_at = ? WHERE id = ?").run(now, id);
    return this.video(id)!;
  }
  /** Statut à renvoyer dans Notion plus tard (l'envoi a raté) ; null = rien en attente. */
  setNotionPush(id: number, status: Status | null) { this.db.prepare('UPDATE videos SET notion_push = ? WHERE id = ?').run(status, id); }
  setStatus(id: number, status: Status, now = Date.now()) {
    const extra = status === 'avalider' ? ', sent_at = @now, reminded_at = NULL' : status === 'publie' ? ', published_at = COALESCE(published_at, @now)' : '';
    this.db.prepare(`UPDATE videos SET status = @status, updated_at = @now${extra} WHERE id = @id`).run({ id, status, now });
  }
  bookSpot(tournageId: number, spot: { name: string; place: string; price: number }) {
    const t = this.db.prepare('SELECT * FROM tournages WHERE id = ?').get(tournageId) as Tournage | undefined;
    if (!t) throw new Error('Tournage introuvable');
    this.db.prepare('UPDATE tournages SET spot_name = ?, spot_place = ?, spot_price = ? WHERE id = ?').run(spot.name, spot.place, spot.price, tournageId);
    const d = new Date(t.date);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // La location est une dépense « Tournage » prévue (remplacée par le vrai mouvement bancaire quand il arrive)
    this.db.prepare("INSERT INTO transactions (date, label, amount, cat, who, source, ext_id) VALUES (?, ?, ?, 'tournage', NULL, 'spot', ?) ON CONFLICT (ext_id) DO UPDATE SET label = excluded.label, amount = excluded.amount")
      .run(date, `LOCATION ${spot.name.toUpperCase()} (${t.code})`, -spot.price * t.hours, `spot:${tournageId}`);
  }

  /** Importe des mouvements bancaires (CSV ou Qonto). Les doublons (même date, libellé, montant) sont ignorés. Renvoie le nombre ajouté. */
  importTx(rows: Array<TxInput & { id?: string }>, source = 'csv'): number {
    const clients = this.clients().map((c) => c.name), monteurs = this.monteurs().map((m) => m.name), learned = this.learned();
    const ins = this.db.prepare('INSERT OR IGNORE INTO transactions (date, label, amount, cat, who, source, ext_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let n = 0;
    this.db.transaction(() => {
      for (const r of rows) {
        const c = classify(r, clients, monteurs, learned);
        n += ins.run(c.date, c.label, c.amount, c.cat, c.who, source, r.id ? `${source}:${r.id}` : `${source}:${c.date}:${c.amount}:${c.label}`).changes;
      }
    })();
    return n;
  }
  /** Rangement à la main d'un mouvement : l'outil retient le libellé pour les suivants. */
  recategorize(id: number, cat: Cat) {
    const t = this.db.prepare('SELECT label FROM transactions WHERE id = ?').get(id) as { label: string } | undefined;
    if (!t) throw new Error('Mouvement introuvable');
    this.db.prepare('UPDATE transactions SET cat = ? WHERE id = ?').run(cat, id);
    if (cat !== 'check') this.db.prepare('INSERT INTO learned (key, cat) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET cat = excluded.cat').run(learnKey(t.label), cat);
  }
}
