import { beforeEach, describe, expect, it } from 'vitest';
import { FanRepo } from '../src/db/fans.js';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { HOUR } from '../src/domain/stats.js';
import { AgencyService } from '../src/services/agency.js';
import { FanService } from '../src/services/fans.js';
import { RecruitmentRepo } from '../src/db/recruitment.js';
import { RecruitmentService } from '../src/services/recruitment.js';
import { createApp } from '../src/web/server.js';

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
    expect((await app.request(`/fan/login?t=${token}`)).headers.get('location')).toBe('/fan?expired=1');

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
});
