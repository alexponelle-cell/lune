import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import type { Repo } from '../db/repo.js';
import { isWindowKey } from '../domain/stats.js';
import type { Analytics } from '../services/analytics.js';
import { dashboardHtml } from './dashboard.js';

export function createApp(deps: { repo: Repo; analytics: Analytics; password?: string }): Hono {
  const { repo, analytics } = deps;
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ ok: true }));

  if (deps.password) {
    const password = deps.password;
    app.use('*', basicAuth({ verifyUser: (_user, pass) => pass === password }));
  }

  app.get('/', (c) => c.html(dashboardHtml));

  app.get('/api/clients', (c) =>
    c.json(repo.listClients().map(({ id, name, slug, rule }) => ({ id, name, slug, rule }))),
  );

  app.get('/api/leaderboard', (c) => {
    const window = c.req.query('window') ?? '7d';
    if (!isWindowKey(window)) return c.json({ error: 'window doit valoir 24h, 7d ou 30d' }, 400);
    const slug = c.req.query('client');
    const client = slug ? repo.getClientBySlug(slug) : undefined;
    if (slug && !client) return c.json({ error: `client inconnu : ${slug}` }, 404);
    return c.json({
      window,
      client: client ? { name: client.name, slug: client.slug } : null,
      generatedAt: Date.now(),
      rows: analytics.leaderboard(window, { client }).map((r) => ({
        clipperId: r.clipper.id,
        username: r.clipper.username,
        accounts: r.accounts,
        ...r.stats,
        rewardCents: r.rewardCents,
      })),
    });
  });

  app.get('/api/clippers/:id', (c) => {
    const detail = analytics.clipperDetail(Number(c.req.param('id')));
    if (!detail) return c.json({ error: 'clipper introuvable' }, 404);
    return c.json({
      ...detail,
      accounts: detail.accounts.map((a) => ({
        id: a.account.id,
        platform: a.account.platform,
        handle: a.account.handle,
        url: a.account.url,
        displayName: a.account.displayName,
        lastCheckedAt: a.account.lastCheckedAt,
        lastError: a.account.lastError,
        windows: a.windows,
        daily: a.daily,
      })),
    });
  });

  return app;
}

export function startWeb(app: Hono, port: number): () => void {
  const server = serve({ fetch: app.fetch, port });
  return () => server.close();
}
