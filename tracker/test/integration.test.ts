import { beforeEach, describe, expect, it } from 'vitest';
import type { Clipper } from '../src/db/repo.js';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { registerAccountsFromMessage } from '../src/bot/comptes.js';
import { DAY, HOUR } from '../src/domain/stats.js';
import { collectAll } from '../src/jobs/collect.js';
import { runRelances } from '../src/jobs/relance.js';
import type { FetcherRegistry, PlatformFetcher } from '../src/platforms/types.js';
import { RecruitmentRepo } from '../src/db/recruitment.js';
import { AgencyService } from '../src/services/agency.js';
import { RecruitmentService } from '../src/services/recruitment.js';
import { Analytics } from '../src/services/analytics.js';
import { createApp } from '../src/web/server.js';

/** Fausse plateforme pilotée par le test : chaque handle a une liste de vidéos modifiable. */
function fakeFetchers(videos: Map<string, Array<{ id: string; views: number; publishedAt: number }>>): FetcherRegistry {
  const make = (platform: 'tiktok' | 'instagram' | 'youtube'): PlatformFetcher => ({
    platform,
    async fetchAccount({ handle }) {
      const list = videos.get(`${platform}:${handle}`);
      if (!list) throw new Error('compte privé');
      return { videos: list.map((v) => ({ platformVideoId: v.id, views: v.views, publishedAt: v.publishedAt })) };
    },
  });
  return { tiktok: make('tiktok'), instagram: make('instagram'), youtube: make('youtube') };
}

const recruitmentOf = (repo: Repo, agency: AgencyService) => new RecruitmentService(repo, new RecruitmentRepo(repo.db), agency);
const fakeBridge = () => ({
  send: async () => true,
  roles: async () => [],
  membersWithRole: async () => [],
  validateTest: async () => [],
  reviewTest: async () => [],
  publishTestMessage: async () => {},
  channels: async () => [],
  ticketUrl: () => null,
  publishCandidatureMessage: async () => {},
  decideCandidature: async () => [],
});

describe('parcours complet', () => {
  let repo: Repo;
  let analytics: Analytics;
  const t0 = 1_000 * DAY;

  beforeEach(() => {
    repo = new Repo(openDatabase(':memory:'));
    analytics = new Analytics(repo);
  });

  it('salon COMPTES → collecte → stats → rémunération → API', async () => {
    const loann = repo.upsertClient({
      name: 'Loann',
      discordChannelId: 'chan-loann',
      rule: { ratePer1kCents: 100, minViews: 0, capCents: null },
    });

    const result = registerAccountsFromMessage(
      repo,
      loann,
      { discordId: 'u1', username: 'Nono' },
      'mes comptes https://tiktok.com/@nono et https://instagram.com/nono',
      t0,
    );
    expect(result?.added).toHaveLength(2);

    // Un autre membre ne peut pas revendiquer le même compte.
    const stolen = registerAccountsFromMessage(repo, loann, { discordId: 'u2', username: 'Voleur' }, 'https://tiktok.com/@nono', t0);
    expect(stolen?.conflicts[0]?.owner).toBe('Nono');

    const videos = new Map([
      ['tiktok:nono', [{ id: 'a', views: 5_000, publishedAt: t0 - 10 * DAY }]],
      ['instagram:nono', [{ id: 'x', views: 1_000, publishedAt: t0 - 10 * DAY }]],
    ]);
    const fetchers = fakeFetchers(videos);
    let clock = t0;

    // Capture initiale = référence (les 6 000 vues existantes ne comptent pas).
    expect(await collectAll(repo, fetchers, () => clock)).toEqual({ ok: 2, failed: 0 });

    // Jour 1 : +2 000 sur la vidéo a, nouvelle vidéo b à 3 000.
    clock = t0 + DAY;
    videos.get('tiktok:nono')!.splice(0, 1, { id: 'a', views: 7_000, publishedAt: t0 - 10 * DAY }, { id: 'b', views: 3_000, publishedAt: t0 + 12 * HOUR });
    await collectAll(repo, fetchers, () => clock);

    // Jour 2 : la vidéo a sort du lot récupéré mais ses vues restent comptées ; b monte.
    clock = t0 + 2 * DAY;
    videos.set('tiktok:nono', [{ id: 'b', views: 4_000, publishedAt: t0 + 12 * HOUR }]);
    videos.set('instagram:nono', [{ id: 'x', views: 1_500, publishedAt: t0 - 10 * DAY }]);
    await collectAll(repo, fetchers, () => clock);

    const nono = repo.getClipperByDiscordId('u1')!;
    const day = analytics.clipperComparison(nono.id, DAY, { now: clock });
    expect(day).toMatchObject({ current: 1_500, previous: 5_000, trend: 'down' });

    const board = analytics.leaderboard('7d', { client: loann, now: clock });
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ accounts: 2, rewardCents: 650 }); // 6 500 vues × 1 €/1k
    expect(board[0]!.stats.current).toBe(6_500);

    // Une erreur de plateforme est enregistrée sans casser la collecte des autres comptes.
    videos.delete('instagram:nono');
    expect(await collectAll(repo, fetchers, () => clock)).toEqual({ ok: 1, failed: 1 });
    expect(repo.getAccountByHandle('instagram', 'nono')?.lastError).toBe('compte privé');

    // Même calcul via la couche "agence" du dashboard (barème de l'agence : 1 € / 1 000 vues).
    repo.setRewardRule('client', loann.id, { base: { enabled: true, perView: 0.001 } });
    const agency = new AgencyService(repo);
    const range = agency.range({ from: clock - 7 * DAY, to: clock + 1 }, clock);
    const ranked = agency.ranked(range, loann.id, clock);
    expect(ranked[0]).toMatchObject({ views: 6_500, posts: 1, rank: 1 });
    expect(ranked[0]!.reward.total).toBe(6.5);

    const app = createApp({ repo, agency, recruitment: recruitmentOf(repo, agency), bot: {} });
    const q = `from=${clock - 7 * DAY}&to=${clock + 1}`;
    const res = await app.request(`/api/leaderboard?${q}&client=${loann.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ username: string; views: number }> };
    expect(body.rows[0]).toMatchObject({ username: 'Nono', views: 6_500 });
    expect((await app.request(`/api/overview?${q}`)).status).toBe(200);
    expect((await app.request(`/api/clippers/${nono.id}?${q}`)).status).toBe(200);
    expect((await app.request('/api/clippers/9999')).status).toBe(404);
    const csv = await (await app.request(`/api/export.csv?${q}`)).text();
    expect(csv).toContain('"Nono"');
  });

  it('gère clippers, strikes, retours et barèmes depuis le dashboard', async () => {
    const agency = new AgencyService(repo);
    const sent: string[] = [];
    const bot = { current: { ...fakeBridge(), send: async (_c: Clipper, text: string) => (sent.push(text), true) } };
    const app = createApp({ repo, agency, recruitment: recruitmentOf(repo, agency), bot });
    const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    const client = (await (await app.request('/api/clients', json('POST', { name: 'Loann', monthlyFee: 1500 }))).json()) as { id: number };
    const created = (await (
      await app.request('/api/clippers', json('POST', { username: 'Saiko', clientId: client.id, accounts: { tiktok: '@Saiko.Edit', youtube: 'https://www.youtube.com/@saiko' } }))
    ).json()) as { clipper: { id: number }; warnings: string[] };
    expect(created.warnings).toEqual([]);
    expect(repo.listAccountsForClipper(created.clipper.id).map((a) => `${a.platform}:${a.handle}`).sort()).toEqual([
      'tiktok:saiko.edit',
      'youtube:saiko',
    ]);

    // Retirer un compte = champ vide ; changer de statut
    await app.request(`/api/clippers/${created.clipper.id}`, json('PATCH', { status: 'inactif', accounts: { youtube: '' } }));
    expect(repo.getClipper(created.clipper.id)?.status).toBe('inactif');
    expect(repo.listAccountsForClipper(created.clipper.id).map((a) => a.platform)).toEqual(['tiktok']);

    // Strike : enregistré et transmis au bot pour prévenir le clipper
    const strike = await app.request(`/api/clippers/${created.clipper.id}/strikes`, json('POST', { reason: 'Absent au call' }));
    expect(strike.status).toBe(200);
    expect(repo.strikes(created.clipper.id)).toHaveLength(1);

    // Barème universel puis surcharge clipper : la plus précise l'emporte
    await app.request('/api/rewards/universal/0', json('PUT', { base: { enabled: true, perView: 0.002 } }));
    await app.request(`/api/rewards/clipper/${created.clipper.id}`, json('PUT', { base: { enabled: true, perView: 0.005 } }));
    expect(agency.rewardConfigFor(repo.getClipper(created.clipper.id)!)).toMatchObject({ source: 'clipper', config: { base: { perView: 0.005 } } });
    await app.request(`/api/rewards/clipper/${created.clipper.id}`, { method: 'DELETE' });
    expect(agency.rewardConfigFor(repo.getClipper(created.clipper.id)!).source).toBe('universal');

    // Réglages : les valeurs invalides sont ignorées
    const settings = (await (await app.request('/api/settings', json('PUT', { postsPerDay: 3, viewsPerDay: -5 }))).json()) as { postsPerDay: number; viewsPerDay: number };
    expect(settings).toMatchObject({ postsPerDay: 3, viewsPerDay: 5_000 });

    // Données invalides → 400
    expect((await app.request('/api/clippers', json('POST', { username: '' }))).status).toBe(400);
    expect(sent).toEqual(['⚠️ Tu as reçu un **strike** : Absent au call']);
  });

  it('protège le dashboard par mot de passe', async () => {
    const app = createApp({ repo, agency: new AgencyService(repo), recruitment: recruitmentOf(repo, new AgencyService(repo)), bot: {}, password: 'secret' });
    const denied = await app.request('/api/meta');
    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toContain('Basic');
    const auth = { Authorization: `Basic ${Buffer.from('x:secret').toString('base64')}` };
    expect((await app.request('/api/meta', { headers: auth })).status).toBe(200);
    expect((await app.request('/', { headers: auth })).status).toBe(200);
    expect((await app.request('/healthz')).status).toBe(200);
  });

  it('relance les inactifs une seule fois par cooldown', async () => {
    const client = repo.upsertClient({ name: 'BeOne', rule: { ratePer1kCents: 80, minViews: 0, capCents: null } });
    registerAccountsFromMessage(repo, client, { discordId: 'u1', username: 'Maé' }, 'https://tiktok.com/@mae', t0);
    const fetchers = fakeFetchers(new Map([['tiktok:mae', [{ id: 'a', views: 100, publishedAt: t0 - 5 * DAY }]]]));
    await collectAll(repo, fetchers, () => t0);

    const sent: Array<{ who: string; msg: string }> = [];
    const notifier = { relance: async (c: Clipper, _r: unknown, msg: string) => void sent.push({ who: c.username, msg }) };
    const settings = { inactivityDays: 3, dropWindowDays: 7, dropThresholdPercent: 30, dropMinPreviousViews: 1000, cooldownHours: 24 };

    expect(await runRelances(repo, analytics, notifier, settings, t0)).toBe(1);
    expect(sent[0]?.who).toBe('Maé');
    expect(await runRelances(repo, analytics, notifier, settings, t0 + HOUR)).toBe(0);
    expect(await runRelances(repo, analytics, notifier, settings, t0 + 25 * HOUR)).toBe(1);
  });
});

describe('vieilles vidéos découvertes en cours de suivi', () => {
  it('ne compte pas leurs vues passées comme vues gagnées', () => {
    const repo = new Repo(openDatabase(':memory:'));
    const t0 = 1_000 * DAY;
    const clipper = repo.upsertClipper('u1', 'Khaby', t0);
    const { account } = repo.registerAccount({ clipperId: clipper.id, clientId: null, platform: 'tiktok', handle: 'k', url: 'u', now: t0 });
    repo.recordCollection(account.id, [{ platformVideoId: 'a', views: 1_000, publishedAt: t0 - DAY }], t0);
    // Le scraper renvoie soudain une vieille vidéo à 50 M de vues + une vraie nouvelle vidéo.
    const snap = repo.recordCollection(
      account.id,
      [
        { platformVideoId: 'a', views: 1_500, publishedAt: t0 - DAY },
        { platformVideoId: 'old', views: 50_000_000, publishedAt: t0 - 300 * DAY },
        { platformVideoId: 'new', views: 2_000, publishedAt: t0 + HOUR },
      ],
      t0 + DAY,
    );
    expect(snap.totalViews - 1_000).toBe(500 + 2_000);
  });
});
