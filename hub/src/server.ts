import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { STATUSES, type Hub, type Video } from './db.js';
import { parseCsv } from './domain/money.js';
import { checkSession, makeSession, samePassword } from './auth.js';
import type { Notify } from './integrations/slack.js';
import type { Config } from './config.js';

const page = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

export function createApp(hub: Hub, cfg: Config, notify: Notify) {
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
  // --- Espace client (lien perso, sans compte) ------------------------------------------
  app.get('/api/portal/:token', (c) => { const cl = hub.clientByToken(c.req.param('token')); return cl ? c.json(portalState(cl.id)) : c.json({ error: 'Lien invalide' }, 404); });
  app.post('/api/portal/:token/videos/:id/:action', async (c) => {
    const cl = hub.clientByToken(c.req.param('token'));
    const v = hub.video(+c.req.param('id'));
    if (!cl || !v || v.client_id !== cl.id) return c.json({ error: 'Vidéo introuvable' }, 404);
    try {
      if (c.req.param('action') === 'validate') await onValidate(hub.validate(v.id));
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
  }
  async function onModif(v: Video) {
    const n = names(), m = v.monteur_id ? n.m.get(v.monteur_id) : undefined;
    hub.log('modif', `${n.c.get(v.client_id)} demande une modif sur « ${v.title} » : ${v.comment}`, n.c.get(v.client_id) ?? null);
    await notify(`✏️ ${m ? (m.slack ? `<@${m.slack}>` : m.name) : 'Équipe'} : *${n.c.get(v.client_id)}* demande une modif sur « ${v.title} » : ${v.comment}`);
  }

  function state() {
    return { clients: hub.clients(), monteurs: hub.monteurs(), videos: hub.videos(), tournages: hub.tournages(), transactions: hub.transactions(), events: hub.events(), now: Date.now(), brand: brand() };
  }
  function portalState(clientId: number) {
    const cl = hub.clients().find((x) => x.id === clientId)!;
    const vids = hub.videos(clientId).filter((v) => ['avalider', 'modif', 'valide', 'planifie', 'publie'].includes(v.status));
    return { client: { id: cl.id, name: cl.name, color: cl.color, fee: cl.fee }, videos: vids, monteurs: hub.monteurs().map((m) => ({ id: m.id, name: m.name })), tournages: hub.tournages().filter((t) => t.client_id === clientId), now: Date.now(), brand: brand() };
  }
  const brand = () => ({ name: hub.setting('brand_name') ?? 'Agence PersonalBrand360', owner: hub.setting('owner_name') ?? 'Adrien' });
  return app;
}
