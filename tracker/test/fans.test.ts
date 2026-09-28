import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FanRepo } from '../src/db/fans.js';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { HOUR } from '../src/domain/stats.js';
import { AgencyService } from '../src/services/agency.js';
import { FanService } from '../src/services/fans.js';
import { RecruitmentRepo } from '../src/db/recruitment.js';
import { RecruitmentService } from '../src/services/recruitment.js';
import { createApp } from '../src/web/server.js';
import { collectAll } from '../src/jobs/collect.js';
import { isAccountsChannel } from '../src/bot/fans.js';

describe('programme fans (Neptune)', () => {
  let repo: Repo;
  let agency: AgencyService;
  let fans: FanService;
  const now = Date.now();

  beforeEach(() => {
    repo = new Repo(openDatabase(':memory:'));
    agency = new AgencyService(repo);
    fans = new FanService(repo, new FanRepo(repo.db), agency, 'https://site.test/', async (name) =>
      name.toLowerCase() === 'paulrbx' ? { id: 42, name: 'PaulRbx' } : null,
    );
    const client = repo.upsertClient({ name: 'BeOne', rule: { ratePer1kCents: 0, minViews: 0, capCents: null } });
    fans.saveSettings({ clientId: client.id, pointsPer1000: 10 });
  });

  /** Le fan poste un compte ; 1re collecte = référence, puis +5 000 vues → 50 points. */
  function fanWithViews() {
    const fan = fans.ensureFan('d1', 'Paul', now - 3 * HOUR);
    expect(fans.addAccounts(fan, 'https://www.tiktok.com/@paul.clips').added).toHaveLength(1);
    const account = repo.listAccountsForClipper(fan.id)[0]!;
    repo.recordCollection(account.id, [{ platformVideoId: 'v1', views: 100, publishedAt: now - 2 * HOUR }], now - 2 * HOUR);
    repo.recordCollection(account.id, [{ platformVideoId: 'v1', views: 5100, publishedAt: now - 2 * HOUR }], now - HOUR);
    return fan;
  }

  it('lien de connexion à usage unique puis session', () => {
    const fan = fans.ensureFan('d1', 'Paul');
    expect(fan.clientId).toBe(fans.settings().clientId);
    const url = fans.loginUrl(fan.id);
    expect(url.startsWith('https://site.test/fan/login?t=')).toBe(true);
    const token = new URL(url).searchParams.get('t')!;
    const session = fans.login(token);
    expect(session).toBeTruthy();
    expect(fans.login(token)).toBeNull();
    expect(fans.clipperFromSession(session!)?.id).toBe(fan.id);
    expect(fans.clipperFromSession('faux')).toBeNull();
  });

  it('points, achat, stock, remboursement et livraison en jeu', async () => {
    const fan = fanWithViews();
    expect(fans.balance(fan.id)).toMatchObject({ views: 5000, earned: 50, balance: 50 });

    const item = fans.saveItem(null, { name: 'VIP', price: 30, kind: 'gamepass', ref: '123456', stock: 1 });
    expect(() => fans.buy(fan, item.id)).toThrow(/Roblox/);
    await expect(fans.linkRoblox(fan, 'inconnu')).rejects.toThrow(/introuvable/);
    await fans.linkRoblox(fan, 'paulrbx');

    const order = fans.buy(fan, item.id);
    expect(fans.balance(fan.id).balance).toBe(20);
    expect(() => fans.buy(fan, item.id)).toThrow(/stock/);

    // Un autre fan ne peut pas prendre le même compte Roblox
    const other = fans.ensureFan('d2', 'Léa');
    await expect(fans.linkRoblox(other, 'paulrbx')).rejects.toThrow(/déjà relié/);

    expect(fans.fans.pendingForRoblox(42).map((o) => o.id)).toEqual([order.id]);
    expect(fans.fans.markDelivered([order.id], 999)).toBe(0);
    expect(fans.fans.refund(order.id)).toBe(true);
    expect(fans.balance(fan.id).balance).toBe(50);
    expect(fans.fans.item(item.id)?.stock).toBe(1);

    const again = fans.buy(fan, item.id);
    expect(fans.fans.markDelivered([again.id], 42)).toBe(1);
    expect(fans.fans.refund(again.id)).toBe(false);
    expect(fans.balance(fan.id).balance).toBe(20);
  });

  it('HTTP : espace fan sans mot de passe staff, API du jeu protégée par clé', async () => {
    const fan = fanWithViews();
    await fans.linkRoblox(fan, 'paulrbx');
    const item = fans.saveItem(null, { name: 'Épée', price: 10, kind: 'item', ref: 'sword' });
    const recruitment = new RecruitmentService(repo, new RecruitmentRepo(repo.db), agency);
    const app = createApp({ repo, agency, recruitment, fans, password: 'secret', robloxApiKey: 'k3y', neptuneApiKey: 'n3p', bot: {} });
    const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    // Dashboard staff : mot de passe ; espace fan : non
    expect((await app.request('/api/fans')).status).toBe(401);
    expect((await app.request('/fan')).status).toBe(200);
    expect((await app.request('/api/fan/me')).status).toBe(401);

    const token = new URL(fans.loginUrl(fan.id)).searchParams.get('t')!;
    const login = await app.request(`/fan/login?t=${token}`);
    expect(login.status).toBe(302);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request(`/fan/login?t=${token}`)).headers.get('location')).toContain('/fan?error=');

    const me = (await (await app.request('/api/fan/me', { headers: { cookie } })).json()) as { balance: number; roblox: { username: string } };
    expect(me).toMatchObject({ balance: 50, roblox: { username: 'PaulRbx' } });
    const bought = await app.request('/api/fan/orders', json('POST', { itemId: item.id }, { cookie }));
    expect(bought.status).toBe(200);

    // Bot Neptune (Python) : lien /site et points
    expect((await app.request('/api/neptune/link', json('POST', { discordId: '123456', username: 'Zoé' }))).status).toBe(401);
    const link = (await (await app.request('/api/neptune/link', json('POST', { discordId: '123456', username: 'Zoé' }, { 'x-api-key': 'n3p' }))).json()) as { url: string };
    expect(link.url).toContain('/fan/login?t=');
    const pts = (await (await app.request('/api/neptune/points', json('POST', { discordId: '999999', username: 'X' }, { 'x-api-key': 'n3p' }))).json()) as { balance: number };
    expect(pts.balance).toBe(0);

    // Jeu Roblox
    expect((await app.request('/api/roblox/pending?userId=42')).status).toBe(401);
    const pending = (await (await app.request('/api/roblox/pending?userId=42', { headers: { 'x-api-key': 'k3y' } })).json()) as {
      orders: Array<{ id: number; ref: string }>;
    };
    expect(pending.orders).toMatchObject([{ ref: 'sword' }]);
    const done = await app.request('/api/roblox/delivered', json('POST', { userId: 42, orderIds: [pending.orders[0]!.id] }, { 'x-api-key': 'k3y' }));
    expect(((await done.json()) as { updated: number }).updated).toBe(1);

    // Staff avec mot de passe
    const auth = { authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` };
    const overview = (await (await app.request('/api/fans', { headers: auth })).json()) as { fans: Array<{ balance: number }>; orders: Array<{ status: string }> };
    expect(overview.fans[0]?.balance).toBe(40);
    expect(overview.orders[0]?.status).toBe('delivered');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('« Se connecter avec Discord » : state vérifié, fan créé, session ouverte', async () => {
    const app = createApp({
      repo,
      agency,
      recruitment: new RecruitmentService(repo, new RecruitmentRepo(repo.db), agency),
      fans,
      discordOAuth: { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://site.test/fan/auth/callback' },
      bot: {},
    });
    const start = await app.request('/fan/auth/discord');
    const authorize = new URL(start.headers.get('location')!);
    expect(authorize.hostname).toBe('discord.com');
    expect(authorize.searchParams.get('scope')).toBe('identify');
    const state = authorize.searchParams.get('state')!;
    const stateCookie = start.headers.get('set-cookie')!.split(';')[0]!;

    // Mauvais state : refusé
    expect((await app.request(`/fan/auth/callback?code=x&state=faux`, { headers: { cookie: stateCookie } })).headers.get('location')).toContain('error=');

    vi.stubGlobal('fetch', async (url: string) =>
      String(url).endsWith('/oauth2/token')
        ? Response.json({ access_token: 'at' })
        : Response.json({ id: '777777', username: 'zoe', global_name: 'Zoé' }),
    );
    const cb = await app.request(`/fan/auth/callback?code=ok&state=${state}`, { headers: { cookie: stateCookie } });
    expect(cb.headers.get('location')).toBe('/fan');
    const session = cb.headers.get('set-cookie')!.match(/fan_session=([^;]+)/)![1]!;
    const me = (await (await app.request('/api/fan/me', { headers: { cookie: `fan_session=${session}` } })).json()) as { username: string };
    expect(me.username).toBe('Zoé');
    expect(repo.getClipperByDiscordId('777777')?.clientId).toBe(fans.settings().clientId);
  });

  it('notifications : état initial silencieux, 1 message par jour, priorités, livraison, désactivation', async () => {
    const fan = fans.ensureFan('d1', 'Paul', now - 3 * HOUR);
    fans.addAccounts(fan, 'https://www.tiktok.com/@paul.clips');
    const account = repo.listAccountsForClipper(fan.id)[0]!;
    const collect = (views: number, at: number) => repo.recordCollection(account.id, [{ platformVideoId: 'v1', views, publishedAt: now - 3 * HOUR }], at);
    collect(100, now - 2 * HOUR);
    collect(5100, now - HOUR); // 5 000 vues = 50 coins
    const item = fans.saveItem(null, { name: 'VIP', price: 80, kind: 'gamepass', ref: '1' });

    const T0 = now;
    expect(fans.generateNotifications(T0)).toBe(0); // premier passage : on mémorise l'état
    collect(9100, T0 + HOUR); // +4 000 vues → 90 coins
    expect(fans.generateNotifications(T0 + 2 * HOUR)).toBe(1);
    let q = fans.fans.pendingNotifications();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ discordId: 'd1', kind: 'afford' }); // objet abordable avant les coins
    expect(q[0]!.text).toContain('VIP');
    fans.fans.ackNotification(q[0]!.id, null);

    // Même jour : rien d'autre
    expect(fans.generateNotifications(T0 + 3 * HOUR)).toBe(0);

    // Lendemain : passage Clippeur (≥ 10 000 vues) prioritaire sur les coins
    collect(12_100, T0 + 20 * HOUR);
    expect(fans.generateNotifications(T0 + 24 * HOUR)).toBe(1);
    q = fans.fans.pendingNotifications();
    expect(q[0]!.kind).toBe('level');
    fans.fans.ackNotification(q[0]!.id, 'Cannot send messages to this user');

    // Jour suivant : top 3 de la semaine (une fois par semaine)
    expect(fans.generateNotifications(T0 + 48 * HOUR)).toBe(1);
    q = fans.fans.pendingNotifications();
    expect(q[0]).toMatchObject({ kind: 'rank' });
    expect(q[0]!.text).toContain('#1');
    fans.fans.ackNotification(q[0]!.id, null);

    // Puis les coins gagnés depuis le dernier message sur les coins
    expect(fans.generateNotifications(T0 + 72 * HOUR)).toBe(1);
    q = fans.fans.pendingNotifications();
    expect(q[0]).toMatchObject({ kind: 'coins' });
    expect(q[0]!.text).toContain('+70 coins');
    fans.fans.ackNotification(q[0]!.id, null);

    // Livraison : toujours annoncée, même le même jour
    await fans.linkRoblox(fan, 'paulrbx');
    const order = fans.buy(fan, item.id, T0 + 73 * HOUR);
    fans.fans.markDelivered([order.id], 42, T0 + 73 * HOUR);
    expect(fans.generateNotifications(T0 + 74 * HOUR)).toBe(1);
    expect(fans.fans.pendingNotifications()[0]).toMatchObject({ kind: 'delivered' });
    expect(fans.generateNotifications(T0 + 75 * HOUR)).toBe(0);

    // Désactivées : plus rien
    fans.fans.setNotify(fan.id, false);
    collect(50_000, T0 + 90 * HOUR);
    expect(fans.generateNotifications(T0 + 100 * HOUR)).toBe(0);
    expect(fans.fans.notificationStats(0)).toMatchObject({ sent: 3, failed: 1, pending: 1 });
  });

  it('collecte : les comptes des fans ne sont relevés qu’une fois par jour', async () => {
    const fan = fans.ensureFan('d1', 'Paul');
    fans.addAccounts(fan, 'https://www.tiktok.com/@paul.clips');
    let calls = 0;
    const fetcher = { platform: 'tiktok' as const, fetchAccount: async () => (calls++, { videos: [] }) };
    const fetchers = { tiktok: fetcher, instagram: { ...fetcher, platform: 'instagram' as const }, youtube: { ...fetcher, platform: 'youtube' as const } };
    const fanClient = fans.settings().clientId;
    const skip = (a: { clientId: number | null; lastCheckedAt: number | null }, t: number) =>
      a.clientId === fanClient && a.lastCheckedAt !== null && t - a.lastCheckedAt < 23.5 * HOUR;
    let t = now;
    await collectAll(repo, fetchers, () => t, skip);
    t += 2 * HOUR;
    await collectAll(repo, fetchers, () => t, skip);
    expect(calls).toBe(1);
    t += 24 * HOUR;
    await collectAll(repo, fetchers, () => t, skip);
    expect(calls).toBe(2);
  });

  it('reconnaît le salon des comptes', () => {
    for (const n of ['👤│comptes', 'mes-comptes', '📱・mes-comptes', 'comptes']) expect(isAccountsChannel(n)).toBe(true);
    for (const n of ['tuto-comptes', '📊│comptes-staff', 'général']) expect(isAccountsChannel(n)).toBe(false);
  });

  it('un même compte ne peut pas être suivi deux fois (même ID réel sous deux adresses)', async () => {
    const a = fans.ensureFan('d1', 'Paul');
    const b = fans.ensureFan('d2', 'Léa');
    fans.addAccounts(a, 'https://www.youtube.com/@paulclips');
    // Même pseudo : refusé tout de suite
    expect(fans.addAccounts(b, 'https://www.youtube.com/@paulclips').conflicts).toHaveLength(1);
    // Même chaîne via son identifiant : acceptée à l'ajout, désactivée à la collecte
    expect(fans.addAccounts(b, 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa').added).toHaveLength(1);
    const fetcher = { platform: 'youtube' as const, fetchAccount: async () => ({ externalId: 'UCaaaaaaaaaaaaaaaaaaaaaa', videos: [{ platformVideoId: 'v', views: 10 }] }) };
    await collectAll(repo, { tiktok: fetcher as never, instagram: fetcher as never, youtube: fetcher });
    expect(repo.listAccountsForClipper(a.id)).toHaveLength(1);
    expect(repo.listAccountsForClipper(b.id)).toHaveLength(0);
  });

  it('/inscription : un champ par réseau, vide = retiré, compte d’un autre refusé', () => {
    const a = fans.ensureFan('d1', 'Paul');
    const b = fans.ensureFan('d2', 'Léa');
    let r = fans.setAccounts(a, { tiktok: '@Paul.Clips', youtube: 'https://www.youtube.com/@paulyt', instagram: '' });
    expect(r.linked.map((l) => `${l.platform}:${l.handle}`)).toEqual(['tiktok:paul.clips', 'youtube:paulyt']);
    r = fans.setAccounts(b, { tiktok: 'paul.clips', youtube: 'pas un lien !!', instagram: '@lea' });
    expect(r.conflicts.map((l) => l.handle)).toEqual(['paul.clips']);
    expect(r.invalid).toEqual(['youtube']);
    expect(fans.accountsOf(b.id).map((x) => x.handle)).toEqual(['lea']);
    r = fans.setAccounts(a, { tiktok: '@paul.clips', youtube: '', instagram: '' });
    expect(r.removed).toEqual(['youtube']);
    expect(fans.accountsOf(a.id).map((x) => x.handle)).toEqual(['paul.clips']);
  });
});
