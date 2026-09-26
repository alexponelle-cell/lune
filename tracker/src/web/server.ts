import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { BotBridge } from '../bot/index.js';
import type { Repo } from '../db/repo.js';
import { parseAccountInput, PLATFORMS } from '../domain/links.js';
import { normalizeRewardConfig } from '../domain/remuneration.js';
import { dayKey } from '../domain/time.js';
import type { AgencyService } from '../services/agency.js';
import type { RecruitmentService } from '../services/recruitment.js';
import { status } from '../status.js';

// Application web (HTML + CSS + JS sans build), copiée dans dist/ par `npm run build`.
const asset = (name: string) => readFileSync(new URL(`./app/${name}`, import.meta.url), 'utf8');
const ASSETS = {
  html: asset('index.html'),
  css: asset('app.css'),
  js: asset('app.js'),
};

export interface WebDeps {
  repo: Repo;
  agency: AgencyService;
  recruitment: RecruitmentService;
  password?: string;
  /** Rempli quand le bot est connecté (sinon les actions Discord sont indisponibles). */
  bot: { current?: BotBridge };
}

const clientIdParam = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

const ClipperBody = z.object({
  username: z.string().trim().min(1).max(80).optional(),
  clientId: z.number().int().positive().nullable().optional(),
  status: z.enum(['actif', 'inactif']).optional(),
  accounts: z
    .object({ tiktok: z.string().optional(), instagram: z.string().optional(), youtube: z.string().optional() })
    .optional(),
});

const ClientBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  discordChannelId: z.string().regex(/^\d*$/).nullable().optional(),
  monthlyFee: z.number().min(0).optional(),
});

export function createApp(deps: WebDeps): Hono {
  const { repo, agency } = deps;
  const app = new Hono();

  app.onError((err, c) => {
    // Les réponses HTTP prévues (ex. 401 + demande de mot de passe) passent telles quelles.
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err instanceof z.ZodError ? 'Données invalides' : err.message }, 400);
  });

  app.get('/healthz', (c) => c.json({ ok: true, bot: status.bot.state }));

  if (deps.password) {
    const password = deps.password;
    app.use('*', basicAuth({ verifyUser: (_user, pass) => pass === password }));
  }

  app.get('/', (c) => c.html(ASSETS.html));
  app.get('/app.css', (c) => c.body(ASSETS.css, 200, { 'content-type': 'text/css; charset=utf-8' }));
  app.get('/app.js', (c) => c.body(ASSETS.js, 200, { 'content-type': 'text/javascript; charset=utf-8' }));

  const rangeOf = (c: { req: { query: (k: string) => string | undefined } }) =>
    agency.range({ preset: c.req.query('preset'), from: c.req.query('from'), to: c.req.query('to') });

  // --- Méta ------------------------------------------------------------------------

  app.get('/api/status', (c) => c.json(status));

  app.get('/api/meta', (c) =>
    c.json({
      status,
      settings: agency.settings(),
      clients: repo.listClients().map((cl) => ({
        id: cl.id,
        name: cl.name,
        slug: cl.slug,
        discordChannelId: cl.discordChannelId,
        monthlyFee: cl.monthlyFeeCents / 100,
      })),
    }),
  );

  // --- Tableaux de bord ------------------------------------------------------------

  app.get('/api/overview', (c) => c.json(agency.overview(rangeOf(c), clientIdParam(c.req.query('client')))));

  app.get('/api/leaderboard', (c) => {
    const range = rangeOf(c);
    return c.json({ range, rows: agency.ranked(range, clientIdParam(c.req.query('client'))).map((r) => agency.rowJson(r)) });
  });

  app.get('/api/clippers/:id', (c) => {
    const profile = agency.profile(Number(c.req.param('id')), rangeOf(c));
    return profile ? c.json(profile) : c.json({ error: 'Clipper introuvable' }, 404);
  });

  app.get('/api/inspiration', (c) => {
    const week = Number(c.req.query('week'));
    return c.json(agency.inspiration(Number.isFinite(week) && week > 0 ? week : Date.now(), clientIdParam(c.req.query('client'))));
  });

  app.get('/api/export.csv', (c) => {
    const range = rangeOf(c);
    const rows = agency.ranked(range, clientIdParam(c.req.query('client')));
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['rang', 'clipper', 'agence', 'vues', 'posts', 'jours_actifs', 'strikes', 'score', 'a_verser_eur'].join(';'),
      ...rows.map((r) =>
        [r.rank, esc(r.clipper.username), esc(agency.clientName(r.clipper.clientId)), r.views, r.posts, r.activeDays, r.strikes, r.score.total, r.reward.total.toFixed(2).replace('.', ',')].join(';'),
      ),
    ];
    const name = `clippers_${dayKey(range.from)}_${dayKey(range.to - 1)}.csv`;
    return c.body(`﻿${lines.join('\n')}`, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
    });
  });

  // --- Management : clippers --------------------------------------------------------

  app.get('/api/management', (c) =>
    c.json(
      repo.listClippers({ includeInactive: true, clientId: clientIdParam(c.req.query('client')) }).map((cl) => ({
        ...cl,
        hasDiscord: !cl.discordId.startsWith('manual:'),
        agency: agency.clientName(cl.clientId),
        accounts: repo.listAccountsForClipper(cl.id).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, url: a.url })),
      })),
    ),
  );

  /** Remplace le compte principal de chaque plateforme indiquée (vide = retire). */
  function applyAccounts(clipperId: number, accounts: z.infer<typeof ClipperBody>['accounts'], clientId: number | null) {
    if (!accounts) return [] as string[];
    const errors: string[] = [];
    for (const platform of PLATFORMS) {
      const raw = accounts[platform];
      if (raw === undefined) continue;
      const existing = repo.listAccountsForClipper(clipperId).filter((a) => a.platform === platform);
      const value = raw.trim();
      if (!value) {
        for (const a of existing) repo.deactivateAccount(a.id);
        continue;
      }
      const parsed = parseAccountInput(platform, value);
      if (!parsed || parsed.platform !== platform) {
        errors.push(`Lien ${platform} invalide`);
        continue;
      }
      if (existing.some((a) => a.handle === parsed.handle)) continue;
      const r = repo.registerAccount({ clipperId, clientId, platform, handle: parsed.handle, url: parsed.url });
      if (r.conflict) {
        errors.push(`@${parsed.handle} (${platform}) appartient déjà à ${r.conflict.username}`);
        continue;
      }
      for (const a of existing) repo.deactivateAccount(a.id);
    }
    return errors;
  }

  app.post('/api/clippers', async (c) => {
    const body = ClipperBody.parse(await c.req.json());
    if (!body.username) return c.json({ error: 'Nom requis' }, 400);
    const clipper = repo.createManualClipper(body.username, body.clientId ?? null);
    if (body.status) repo.updateClipper(clipper.id, { status: body.status });
    const warnings = applyAccounts(clipper.id, body.accounts, clipper.clientId);
    return c.json({ clipper: repo.getClipper(clipper.id), warnings });
  });

  app.patch('/api/clippers/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = ClipperBody.parse(await c.req.json());
    const clipper = repo.updateClipper(id, { username: body.username, clientId: body.clientId, status: body.status });
    if (!clipper) return c.json({ error: 'Clipper introuvable' }, 404);
    const warnings = applyAccounts(id, body.accounts, clipper.clientId);
    return c.json({ clipper: repo.getClipper(id), warnings });
  });

  app.delete('/api/clippers/:id', (c) => {
    repo.deleteClipper(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  app.get('/api/discord/roles', async (c) => {
    if (!deps.bot.current) return c.json({ error: 'Bot Discord non connecté' }, 503);
    return c.json(await deps.bot.current.roles());
  });

  app.post('/api/discord/import', async (c) => {
    const bot = deps.bot.current;
    if (!bot) return c.json({ error: 'Bot Discord non connecté' }, 503);
    const body = z.object({ roleId: z.string().regex(/^\d+$/), clientId: z.number().int().positive().nullable() }).parse(await c.req.json());
    const members = await bot.membersWithRole(body.roleId);
    let created = 0;
    for (const m of members) {
      const existed = repo.getClipperByDiscordId(m.id);
      repo.upsertClipper(m.id, m.name, Date.now(), body.clientId);
      if (!existed) created++;
    }
    return c.json({ found: members.length, created });
  });

  // --- Strikes & retours --------------------------------------------------------------

  app.post('/api/clippers/:id/strikes', async (c) => {
    const clipper = repo.getClipper(Number(c.req.param('id')));
    if (!clipper) return c.json({ error: 'Clipper introuvable' }, 404);
    const { reason, notify } = z
      .object({ reason: z.string().trim().min(1).max(500), notify: z.boolean().default(true) })
      .parse(await c.req.json());
    const strike = repo.addStrike(clipper.id, reason);
    const sent = notify && deps.bot.current
      ? await deps.bot.current.send(clipper, `⚠️ Tu as reçu un **strike** : ${reason}`)
      : false;
    return c.json({ strike, sent });
  });

  app.delete('/api/strikes/:id', (c) => {
    repo.deleteStrike(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  app.post('/api/videos/:id/feedback', async (c) => {
    const video = repo.getVideo(Number(c.req.param('id')));
    if (!video) return c.json({ error: 'Vidéo introuvable' }, 404);
    const clipper = repo.getClipper(video.clipperId)!;
    const { message } = z.object({ message: z.string().trim().min(1).max(1500) }).parse(await c.req.json());
    const id = repo.addFeedback(clipper.id, video.id, message);
    const link = video.url ? `\n${video.url}` : '';
    const sent = deps.bot.current ? await deps.bot.current.send(clipper, `📝 **Retour sur ta vidéo** :${link}\n\n${message}`) : false;
    if (sent) repo.markFeedbackDelivered(id);
    return c.json({ ok: true, sent });
  });

  // --- Rémunération -------------------------------------------------------------------

  app.get('/api/remuneration', (c) => c.json(agency.payoutSummary(rangeOf(c), clientIdParam(c.req.query('client')))));

  app.get('/api/rewards', (c) =>
    c.json({
      universal: normalizeRewardConfig(repo.getRewardRule('universal', 0) ?? {}),
      overrides: repo.listRewardRuleScopes().filter((s) => s.scope !== 'universal'),
    }),
  );

  app.get('/api/rewards/:scope/:id', (c) => {
    const scope = c.req.param('scope');
    const id = Number(c.req.param('id'));
    const raw = repo.getRewardRule(scope, scope === 'universal' ? 0 : id);
    return c.json({ exists: raw !== undefined, config: normalizeRewardConfig(raw ?? repo.getRewardRule('universal', 0) ?? {}) });
  });

  app.put('/api/rewards/:scope/:id', async (c) => {
    const scope = z.enum(['universal', 'client', 'clipper']).parse(c.req.param('scope'));
    const config = normalizeRewardConfig(await c.req.json());
    repo.setRewardRule(scope, scope === 'universal' ? 0 : Number(c.req.param('id')), config);
    return c.json({ ok: true, config });
  });

  app.delete('/api/rewards/:scope/:id', (c) => {
    const scope = z.enum(['client', 'clipper']).parse(c.req.param('scope'));
    repo.deleteRewardRule(scope, Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  // --- Paramètres & agences -------------------------------------------------------------

  app.put('/api/settings', async (c) => c.json(agency.saveSettings(await c.req.json())));

  app.post('/api/clients', async (c) => {
    const body = ClientBody.parse(await c.req.json());
    if (!body.name) return c.json({ error: 'Nom requis' }, 400);
    const created = repo.upsertClient({
      name: body.name,
      discordChannelId: body.discordChannelId || null,
      rule: { ratePer1kCents: 0, minViews: 0, capCents: null },
    });
    repo.updateClient(created.id, { monthlyFeeCents: Math.round((body.monthlyFee ?? 0) * 100) });
    return c.json(repo.getClient(created.id));
  });

  app.patch('/api/clients/:id', async (c) => {
    const body = ClientBody.parse(await c.req.json());
    const updated = repo.updateClient(Number(c.req.param('id')), {
      name: body.name,
      discordChannelId: body.discordChannelId === undefined ? undefined : body.discordChannelId || null,
      monthlyFeeCents: body.monthlyFee === undefined ? undefined : Math.round(body.monthlyFee * 100),
    });
    return updated ? c.json(updated) : c.json({ error: 'Agence introuvable' }, 404);
  });

  app.delete('/api/clients/:id', (c) => {
    repo.deleteClient(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  // --- Recrutement (phase 2) --------------------------------------------------------------

  const { recruitment } = deps;
  const rec = recruitment.rec;
  const ticket = (channelId: string | null) => (channelId ? deps.bot.current?.ticketUrl(channelId) ?? null : null);

  app.get('/api/recruitment/settings', (c) => c.json(recruitment.settings()));
  app.put('/api/recruitment/settings', async (c) => c.json(recruitment.saveSettings(await c.req.json())));

  app.get('/api/funnel', (c) => {
    const recruiter = clientIdParam(c.req.query('recruiter'));
    const f = recruitment.funnel(rangeOf(c), { recruiterId: recruiter });
    return c.json({ ...f, people: f.people.map((p) => ({ ...p, ticketUrl: ticket(p.channelId) })) });
  });

  app.get('/api/agency-cards', (c) => c.json(recruitment.agencyCards(rangeOf(c))));

  app.get('/api/recruiters', (c) => c.json({ settings: recruitment.settings(), rows: recruitment.recruitersReport(rangeOf(c)) }));

  app.patch('/api/recruiters/:id', async (c) => {
    const body = z.object({ name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() }).parse(await c.req.json());
    rec.updateRecruiter(Number(c.req.param('id')), body);
    return c.json({ ok: true });
  });

  app.delete('/api/recruiters/:id', (c) => {
    rec.deleteRecruiter(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  app.get('/api/suivi', (c) => {
    const s = recruitment.suivi(rangeOf(c));
    const withTicket = <T extends { channelId: string | null }>(list: T[]) => list.map((x) => ({ ...x, ticketUrl: ticket(x.channelId) }));
    return c.json({
      ...s,
      toTreat: {
        ...s.toTreat,
        tests: withTicket(s.toTreat.tests),
        messages: withTicket(s.toTreat.messages),
        candidatures: withTicket(s.toTreat.candidatures),
      },
      rows: withTicket(s.rows),
    });
  });

  app.post('/api/candidatures/:id/decide', async (c) => {
    const id = Number(c.req.param('id'));
    const { accept } = z.object({ accept: z.boolean() }).parse(await c.req.json());
    const cand = rec.candidature(id);
    if (!cand) return c.json({ error: 'Candidature introuvable' }, 404);
    if (cand.status !== 'submitted' && cand.status !== 'open') return c.json({ error: 'Candidature déjà traitée' }, 400);
    if (deps.bot.current) return c.json({ ok: true, warnings: await deps.bot.current.decideCandidature(id, accept, 'dashboard') });
    rec.decideCandidature(id, accept, 'dashboard');
    if (accept) rec.setStage(cand.clipperId, 'test');
    return c.json({ ok: true, warnings: ['Bot hors ligne : message et rôle Discord non envoyés'] });
  });

  app.post('/api/tests/:clipperId/validate', async (c) => {
    const clipperId = Number(c.req.param('clipperId'));
    if (!rec.candidate(clipperId)) return c.json({ error: 'Candidat introuvable' }, 404);
    if (deps.bot.current) return c.json({ ok: true, warnings: await deps.bot.current.validateTest(clipperId) });
    const test = rec.currentTest(clipperId);
    if (test) rec.reviewTest(test.id, 'validated', null);
    rec.setStage(clipperId, 'clipper');
    return c.json({ ok: true, warnings: ['Bot hors ligne : message et rôle Discord non envoyés'] });
  });

  app.post('/api/tests/:clipperId/review', async (c) => {
    const clipperId = Number(c.req.param('clipperId'));
    const { note, final } = z.object({ note: z.string().trim().max(1500).default(''), final: z.boolean().default(false) }).parse(await c.req.json());
    if (!final && !note) return c.json({ error: 'Explique ce qu’il faut corriger' }, 400);
    if (!rec.candidate(clipperId)) return c.json({ error: 'Candidat introuvable' }, 404);
    if (deps.bot.current) return c.json({ ok: true, warnings: await deps.bot.current.reviewTest(clipperId, note, final) });
    const test = rec.currentTest(clipperId);
    if (test) rec.reviewTest(test.id, final ? 'refused' : 'changes', note);
    if (final) rec.setStage(clipperId, 'refuse');
    return c.json({ ok: true, warnings: ['Bot hors ligne : message Discord non envoyé'] });
  });

  app.post('/api/requests/:id/done', (c) => {
    rec.closeRequest(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  /** Réponse à une demande d'avis : enregistrée comme analyse + envoyée sur Discord. */
  app.post('/api/requests/:id/feedback', async (c) => {
    const request = rec.request(Number(c.req.param('id')));
    if (!request) return c.json({ error: 'Demande introuvable' }, 404);
    const clipper = repo.getClipper(request.clipperId);
    if (!clipper) return c.json({ error: 'Clipper introuvable' }, 404);
    const { message } = z.object({ message: z.string().trim().min(1).max(1500) }).parse(await c.req.json());
    const id = repo.addFeedback(clipper.id, null, message);
    const link = request.payload.url ? `\n${request.payload.url}` : '';
    const sent = deps.bot.current ? await deps.bot.current.send(clipper, `📝 **Retour sur ta vidéo** :${link}\n\n${message}`) : false;
    if (sent) repo.markFeedbackDelivered(id);
    rec.closeRequest(request.id);
    return c.json({ ok: true, sent });
  });

  app.get('/api/discord/channels', async (c) => {
    if (!deps.bot.current) return c.json({ error: 'Bot Discord non connecté' }, 503);
    return c.json(await deps.bot.current.channels());
  });

  app.post('/api/discord/test-message', async (c) => {
    if (!deps.bot.current) return c.json({ error: 'Bot Discord non connecté' }, 503);
    const { channelId } = z.object({ channelId: z.string().regex(/^\d+$/) }).parse(await c.req.json());
    await deps.bot.current.publishTestMessage(channelId);
    recruitment.saveSettings({ testChannelId: channelId });
    return c.json({ ok: true });
  });

  app.post('/api/discord/start-message', async (c) => {
    if (!deps.bot.current) return c.json({ error: 'Bot Discord non connecté' }, 503);
    const { channelId } = z.object({ channelId: z.string().regex(/^\d+$/) }).parse(await c.req.json());
    await deps.bot.current.publishStartMessage(channelId);
    recruitment.saveSettings({ welcomeChannelId: channelId });
    return c.json({ ok: true });
  });

  app.post('/api/discord/candidature-message', async (c) => {
    if (!deps.bot.current) return c.json({ error: 'Bot Discord non connecté' }, 503);
    const { channelId } = z.object({ channelId: z.string().regex(/^\d+$/) }).parse(await c.req.json());
    await deps.bot.current.publishCandidatureMessage(channelId);
    recruitment.saveSettings({ candidatureChannelId: channelId });
    return c.json({ ok: true });
  });

  // Toute autre route GET renvoie l'application (navigation côté navigateur).
  app.get('*', (c) => c.html(ASSETS.html));

  return app;
}

export function startWeb(app: Hono, port: number): () => void {
  const server = serve({ fetch: app.fetch, port });
  return () => server.close();
}
