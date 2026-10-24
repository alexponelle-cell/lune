import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { STATUSES, UNDO_MS, type Hub, type Status, type Video } from './db.js';
import { parseCsv } from './domain/money.js';
import { checkSession, makeSession, samePassword } from './auth.js';
import type { Notify } from './integrations/slack.js';
import { Notion, syncNotion, mapOfDb, type DbMap } from './integrations/notion.js';
import type { Config } from './config.js';
import type { Mailer } from './integrations/mail.js';
import { Qonto, syncQonto } from './integrations/qonto.js';
import { syncCalendar, type CalEvent } from './integrations/calendar.js';

const ST_NAME: Record<Status, string> = { idee: 'Idée', script: 'Scripting', afilmer: 'À filmer', filme: 'Filmé', montage: 'En montage', avalider: 'À valider', modif: 'Modif', valide: 'Validé', planifie: 'Planifié', publie: 'Publié' };
const page = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

export function createApp(hub: Hub, cfg: Config, notify: Notify, makeNotion: (token: string) => Notion = (t) => new Notion(t), mail: Mailer | null = null,
  ext: { makeQonto?: (login: string, secret: string) => Qonto; fetchImpl?: typeof fetch } = {}) {
  const makeQonto = ext.makeQonto ?? ((l: string, s: string) => new Qonto(l, s));
  if (cfg.ADMIN_PASSWORD && !cfg.SESSION_SECRET) throw new Error('SESSION_SECRET manquant : sans lui, n’importe qui pourrait fabriquer une session (Railway → Variables)');
  /** Clé Notion : collée par Adrien dans le hub (Connexions), sinon variable NOTION_TOKEN. */
  const notionToken = () => hub.setting('notion_token') ?? cfg.NOTION_TOKEN ?? null;
  const notion = () => { const t = notionToken(); return t ? makeNotion(t) : null; };
  const app = new Hono();
  const secret = cfg.SESSION_SECRET ?? 'dev-only-secret-change-me';
  const open = !cfg.ADMIN_PASSWORD; // sans mot de passe (dev) : accès libre
  const logged = (c: Context) => open || checkSession(secret, getCookie(c, 'p360'));
  const shell = (portal: string | null) => page('app.html').replace('<script>/*BOOT*/', `<script>window.__PORTAL__ = ${JSON.stringify(portal)};`);

  // --- Pages ---------------------------------------------------------------------
  app.get('/', (c) => (logged(c) ? c.html(shell(null)) : c.html(page('login.html'))));
  app.post('/login', async (c) => {
    const { password } = (await c.req.parseBody()) as { password?: string };
    if (!cfg.ADMIN_PASSWORD || !password || !samePassword(password, cfg.ADMIN_PASSWORD)) return c.html(page('login.html').replace('<!--ERR-->', '<p class="err">Mot de passe incorrect</p>'), 401);
    setCookie(c, 'p360', makeSession(secret), { httpOnly: true, sameSite: 'Lax', secure: cfg.PUBLIC_URL.startsWith('https'), path: '/', maxAge: 30 * 86400 });
    return c.redirect('/');
  });
  app.post('/logout', (c) => { deleteCookie(c, 'p360', { path: '/' }); return c.redirect('/'); });
  app.get('/c/:token', (c) => (hub.clientByToken(c.req.param('token')) ? c.html(shell(c.req.param('token'))) : c.text('Lien invalide', 404)));
  app.get('/healthz', (c) => c.text('ok'));

  // --- API du hub (Adrien / Romain) --------------------------------------------------
  const api = new Hono();
  api.use('*', async (c, next) => (logged(c) ? next() : c.json({ error: 'Connecte-toi' }, 401)));
  const fail = (c: Context, err: unknown) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400);

  api.get('/state', (c) => c.json(state()));
  api.post('/videos/:id/validate', async (c) => { try { await onValidate(hub.validate(+c.req.param('id'))); return c.json(state()); } catch (e) { return fail(c, e); } });
  api.post('/videos/:id/modif', async (c) => {
    try { const { comment } = z.object({ comment: z.string().min(1) }).parse(await c.req.json()); await onModif(hub.requestChange(+c.req.param('id'), comment)); return c.json(state()); } catch (e) { return fail(c, e); }
  });
  api.post('/videos/:id/undo', async (c) => { try { await onUndo(hub.undoValidate(+c.req.param('id'))); return c.json(state()); } catch (e) { return fail(c, e); } });
  api.post('/videos/:id/plan', async (c) => {
    try {
      const { at } = z.object({ at: z.number().int().positive() }).parse(await c.req.json());
      const v = hub.plan(+c.req.param('id'), at), n = names();
      hub.log('planif', `« ${v.title} » (${n.c.get(v.client_id)}) planifiée le ${new Date(at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })}`, n.c.get(v.client_id) ?? null, false);
      await toNotion(v, 'planifie', at);
      return c.json(state());
    } catch (e) { return fail(c, e); }
  });
  // --- Clients et monteurs ---
  const clientBody = z.object({ name: z.string().trim().min(1).max(80), fee: z.number().min(0), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FCCA09'),
    email: z.string().trim().email().or(z.literal('')).transform((x) => x || null).default(''), instagram: z.string().trim().max(80).transform((x) => x.replace(/^@/, '') || null).default('') });
  const monteurBody = z.object({ name: z.string().trim().min(1).max(80), rate: z.number().min(0), slack: z.string().trim().max(40).transform((x) => x || null).default('') });
  api.post('/clients', async (c) => { try { const b = clientBody.parse(await c.req.json()); hub.addClient(b.name, b.fee, b.color, b.instagram, b.email); return c.json(state()); } catch (e) { return fail(c, dup(e)); } });
  api.post('/clients/:id', async (c) => { try { hub.updateClient(+c.req.param('id'), clientBody.parse(await c.req.json())); return c.json(state()); } catch (e) { return fail(c, dup(e)); } });
  api.post('/clients/:id/archive', (c) => { hub.archive('clients', +c.req.param('id')); return c.json(state()); });
  api.post('/monteurs', async (c) => { try { const b = monteurBody.parse(await c.req.json()); hub.addMonteur(b.name, b.rate, b.slack); return c.json(state()); } catch (e) { return fail(c, dup(e)); } });
  api.post('/monteurs/:id', async (c) => { try { hub.updateMonteur(+c.req.param('id'), monteurBody.parse(await c.req.json())); return c.json(state()); } catch (e) { return fail(c, dup(e)); } });
  api.post('/monteurs/:id/archive', (c) => { hub.archive('monteurs', +c.req.param('id')); return c.json(state()); });
  api.post('/tournages', async (c) => {
    try { const b = z.object({ client_id: z.number().int(), date: z.number().int().positive(), hours: z.number().positive().max(24) }).parse(await c.req.json()); hub.addTournageFor(b.client_id, b.date, b.hours); return c.json(state()); } catch (e) { return fail(c, e); }
  });
  /** Relance de paiement : e-mail au client si possible, sinon erreur claire (pas de faux « envoyé »). */
  api.post('/clients/:id/remind-invoice', async (c) => {
    try {
      const { month, amount } = z.object({ month: z.string().min(1).max(40), amount: z.number().positive() }).parse(await c.req.json());
      const cl = hub.clients().find((x) => x.id === +c.req.param('id'));
      if (!cl) throw new Error('Client introuvable');
      if (!cl.email) throw new Error(`Ajoute l’e-mail de ${cl.name} (page Clients & monteurs) pour le relancer`);
      if (!mail) throw new Error('E-mails pas encore branchés (SMTP_URL dans Railway)');
      await mail(cl.email, `Petit rappel : facture de ${month}`, `Hello !\n\nPetit rappel pour la facture de ${month} (${amount.toLocaleString('fr-FR')} €), on ne l'a pas encore reçue de notre côté.\nSi c'est déjà fait, ignore ce message 🙏\n\nMerci !`);
      hub.log('relance', `Relance de paiement envoyée à ${cl.name} (${month}, ${amount} €)`, cl.name, false);
      return c.json({ ok: true, state: state() });
    } catch (e) { return fail(c, e); }
  });
  api.post('/videos/:id/status', async (c) => {
    try { const { status } = z.object({ status: z.enum(STATUSES) }).parse(await c.req.json()); hub.setStatus(+c.req.param('id'), status); return c.json(state()); } catch (e) { return fail(c, e); }
  });
  api.post('/tx/:id', async (c) => {
    try { const { cat } = z.object({ cat: z.enum(['client', 'monteur', 'outil', 'tournage', 'autre', 'check']) }).parse(await c.req.json()); hub.recategorize(+c.req.param('id'), cat); return c.json(state()); } catch (e) { return fail(c, e); }
  });
  api.post('/import', async (c) => {
    try { const rows = parseCsv(await c.req.text()); if (!rows.length) throw new Error('Aucune opération reconnue dans ce fichier'); const added = hub.importTx(rows, 'csv'); return c.json({ added, total: rows.length, state: state() }); } catch (e) { return fail(c, e); }
  });
  api.post('/tournages/:id/spot', async (c) => {
    try { const s = z.object({ name: z.string().min(1), place: z.string(), price: z.number().positive() }).parse(await c.req.json()); hub.bookSpot(+c.req.param('id'), s); hub.log('spot', `${s.name} réservé`, null, false); return c.json(state()); } catch (e) { return fail(c, e); }
  });
  api.post('/slack', async (c) => {
    try { const { text, kind } = z.object({ text: z.string().min(1).max(2000), kind: z.string().default('message') }).parse(await c.req.json()); await notify(text); hub.log(kind, text.replace(/\*/g, ''), null, false); return c.json({ ok: true }); } catch (e) { return fail(c, e); }
  });
  api.post('/notion/token', async (c) => {
    try {
      const { token } = z.object({ token: z.string().min(20) }).parse(await c.req.json());
      const r = await syncNotion(hub, makeNotion(token.trim())); // vérifie la clé en faisant une 1re synchro
      hub.setSetting('notion_token', token.trim());
      hub.log('notion', `Notion connecté : ${r.bases} base(s), ${r.created} vidéo(s) importée(s)`, null, false);
      return c.json({ ...r, state: state() });
    } catch (e) { return fail(c, e); }
  });
  api.post('/notion/sync', async (c) => {
    const n = notion();
    if (!n) return fail(c, new Error('Notion n’est pas encore connecté'));
    try { const r = await syncNotion(hub, n); return c.json({ ...r, state: state() }); } catch (e) { return fail(c, e); }
  });
  api.post('/notion/disconnect', (c) => { hub.db.prepare("DELETE FROM settings WHERE key IN ('notion_token', 'notion_dbs')").run(); return c.json(state()); });
  // --- Banque Qonto (lecture seule) et Google Agenda : clés collées par Adrien, gardées dans la base ---
  api.post('/qonto', async (c) => {
    try {
      const { login, secret } = z.object({ login: z.string().trim().min(3).max(200), secret: z.string().trim().min(8).max(200) }).parse(await c.req.json());
      const r = await syncQonto(hub, makeQonto(login, secret)); // vérifie la clé en important tout de suite
      hub.setSetting('qonto_login', login); hub.setSetting('qonto_secret', secret);
      hub.log('qonto', `Qonto connecté : ${r.added} mouvement(s) importé(s)`, null, false);
      return c.json({ ...r, state: state() });
    } catch (e) { return fail(c, e); }
  });
  api.post('/qonto/sync', async (c) => {
    const l = hub.setting('qonto_login'), s = hub.setting('qonto_secret');
    if (!l || !s) return fail(c, new Error('Qonto n’est pas encore connecté'));
    try { const r = await syncQonto(hub, makeQonto(l, s)); return c.json({ ...r, state: state() }); } catch (e) { return fail(c, e); }
  });
  api.post('/qonto/disconnect', (c) => { hub.db.prepare("DELETE FROM settings WHERE key IN ('qonto_login', 'qonto_secret')").run(); return c.json(state()); });
  api.post('/calendar', async (c) => {
    try {
      const { url } = z.object({ url: z.string().trim().url().max(1000) }).parse(await c.req.json());
      const n = await syncCalendar(hub, url, Date.now(), ext.fetchImpl);
      hub.setSetting('gcal_url', url);
      return c.json({ events: n, state: state() });
    } catch (e) { return fail(c, e); }
  });
  api.post('/calendar/sync', async (c) => {
    const url = hub.setting('gcal_url');
    if (!url) return fail(c, new Error('Google Agenda n’est pas encore relié'));
    try { const n = await syncCalendar(hub, url, Date.now(), ext.fetchImpl); return c.json({ events: n, state: state() }); } catch (e) { return fail(c, e); }
  });
  // --- Spots favoris d'Adrien (ex. le studio de Bobby) ---
  const spotBody = z.object({ name: z.string().trim().min(1).max(80), place: z.string().trim().max(80).default(''), price: z.number().min(0).max(10_000), url: z.string().trim().url().max(500).or(z.literal('')).default(''), note: z.string().trim().max(200).default('') });
  const mySpots = () => JSON.parse(hub.setting('my_spots') ?? '[]') as Array<z.infer<typeof spotBody>>;
  api.post('/spots', async (c) => { try { const s = spotBody.parse(await c.req.json()); hub.setSetting('my_spots', JSON.stringify([...mySpots(), s].slice(-50))); return c.json(state()); } catch (e) { return fail(c, e); } });
  api.post('/spots/:i/remove', (c) => { const l = mySpots(); l.splice(+c.req.param('i'), 1); hub.setSetting('my_spots', JSON.stringify(l)); return c.json(state()); });
  api.post('/calendar/disconnect', (c) => { hub.db.prepare("DELETE FROM settings WHERE key IN ('gcal_url', 'gcal_events')").run(); return c.json(state()); });
  // --- Espace client (lien perso, sans compte) ------------------------------------------
  app.get('/api/portal/:token', (c) => { const cl = hub.clientByToken(c.req.param('token')); return cl ? c.json(portalState(cl.id)) : c.json({ error: 'Lien invalide' }, 404); });
  app.post('/api/portal/:token/videos/:id/:action', async (c) => {
    const cl = hub.clientByToken(c.req.param('token'));
    const v = hub.video(+c.req.param('id'));
    if (!cl || !v || v.client_id !== cl.id) return c.json({ error: 'Vidéo introuvable' }, 404);
    try {
      const action = c.req.param('action');
      if (action === 'validate') await onValidate(hub.validate(v.id));
      else if (action === 'undo') await onUndo(hub.undoValidate(v.id));
      else { const { comment } = z.object({ comment: z.string().min(1) }).parse(await c.req.json()); await onModif(hub.requestChange(v.id, comment)); }
      return c.json(portalState(cl.id));
    } catch (e) { return fail(c, e); }
  });

  // (après l'espace client : le contrôle de connexion de /api ne doit pas bloquer les liens clients)
  app.route('/api', api);

  // --- Effets des actions ------------------------------------------------------------------
  const names = () => ({ c: new Map(hub.clients().map((x) => [x.id, x.name])), m: new Map(hub.monteurs().map((x) => [x.id, x])) });
  async function onValidate(v: Video) {
    const n = names(), m = v.monteur_id ? n.m.get(v.monteur_id) : undefined;
    hub.log('validation', `${n.c.get(v.client_id)} a validé « ${v.title} »${m ? ` (+${m.rate} € pour ${m.name})` : ''}`, n.c.get(v.client_id) ?? null);
    await notify(`✅ *${n.c.get(v.client_id)}* a validé « ${v.title} »${m ? ` · ${m.slack ? `<@${m.slack}>` : m.name} +${m.rate} €` : ''}`);
    await notify(`📅 À planifier : « ${v.title} » (${n.c.get(v.client_id)}) → hub, page Planning`);
    await toNotion(v, 'valide');
  }
  async function onUndo(v: Video) {
    const n = names();
    hub.log('annulation', `${n.c.get(v.client_id)} a annulé la validation de « ${v.title} »`, n.c.get(v.client_id) ?? null);
    await notify(`↩️ *${n.c.get(v.client_id)}* a annulé sa validation de « ${v.title} » (clic par erreur) : elle repasse « à valider ».`);
    await toNotion(v, 'avalider');
  }
  async function onModif(v: Video) {
    const n = names(), m = v.monteur_id ? n.m.get(v.monteur_id) : undefined;
    hub.log('modif', `${n.c.get(v.client_id)} demande une modif sur « ${v.title} » : ${v.comment}`, n.c.get(v.client_id) ?? null);
    await notify(`✏️ ${m ? (m.slack ? `<@${m.slack}>` : m.name) : 'Équipe'} : *${n.c.get(v.client_id)}* demande une modif sur « ${v.title} » : ${v.comment}`);
    await toNotion(v, 'modif');
  }
  /** Reporte le nouveau statut dans Notion (« Validé », ou retour au montage avec la remarque du client en commentaire). */
  async function toNotion(v: Video, status: Status, date?: number) {
    const n = notion(), map = mapOfDb(hub, v.notion_db);
    if (!n || !map || !v.notion_id) return;
    // « modif » n'existe pas toujours dans Notion : on renvoie alors en « En montage »
    const target: Status = status === 'modif' && !map.options.modif ? 'montage' : status;
    try {
      const ok = await n.setStatus(v.notion_id, map, target, date);
      if (status === 'modif' && v.comment) await n.comment(v.notion_id, `Retour client : ${v.comment}`);
      hub.setNotionPush(v.id, null);
      if (!ok) hub.log('notion', `Pas d’étape « ${ST_NAME[target]} » dans la base Notion de « ${v.title} »`, null, true);
    } catch (e) {
      hub.setNotionPush(v.id, target); // renvoyé à la prochaine synchro, sans être écrasé par l'ancien statut de Notion
      hub.log('notion', `Notion pas encore à jour pour « ${v.title} » (nouvel essai dans 10 min) : ${e instanceof Error ? e.message : e}`, null, true);
    }
  }
  const dup = (e: unknown) => (e instanceof Error && /UNIQUE/.test(e.message) ? new Error('Ce nom existe déjà') : e);

  function state() {
    return { clients: hub.clients(), monteurs: hub.monteurs(), videos: hub.videos(), tournages: hub.tournages(), transactions: hub.transactions(), events: hub.events(), now: Date.now(), brand: brand(), notion: notionInfo(), undoMs: UNDO_MS, integrations: { slack: !!cfg.SLACK_WEBHOOK_URL, mail: !!mail }, mode: cfg.HUB_MODE, mySpots: JSON.parse(hub.setting('my_spots') ?? '[]'),
      qonto: { connected: !!hub.setting('qonto_secret'), lastSync: Number(hub.setting('qonto_last_sync') ?? 0) || null },
      calendar: { connected: !!hub.setting('gcal_url'), lastSync: Number(hub.setting('gcal_last_sync') ?? 0) || null, events: JSON.parse(hub.setting('gcal_events') ?? '[]') as CalEvent[] } };
  }
  const notionInfo = () => ({ connected: !!notionToken(), lastSync: Number(hub.setting('notion_last_sync') ?? 0) || null, bases: (JSON.parse(hub.setting('notion_dbs') ?? '[]') as DbMap[]).map((m) => ({ client: m.client, title: m.title })) });
  function portalState(clientId: number) {
    const cl = hub.clients().find((x) => x.id === clientId)!;
    const vids = hub.videos(clientId).filter((v) => ['avalider', 'modif', 'valide', 'planifie', 'publie'].includes(v.status));
    // Le client ne voit pas les liens internes (page Notion d'Adrien)
    const safe = vids.map(({ url: _u, notion_id: _n, notion_db: _d, notion_push: _p, ...v }) => v);
    return { client: { id: cl.id, name: cl.name, color: cl.color, fee: cl.fee }, videos: safe, undoMs: UNDO_MS, monteurs: hub.monteurs().map((m) => ({ id: m.id, name: m.name })), tournages: hub.tournages().filter((t) => t.client_id === clientId), now: Date.now(), brand: brand() };
  }
  const brand = () => ({ name: hub.setting('brand_name') ?? 'Agence PersonalBrand360', owner: hub.setting('owner_name') ?? 'Adrien' });
  return app;
}
