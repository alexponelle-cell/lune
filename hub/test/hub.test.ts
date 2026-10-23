import { describe, expect, it } from 'vitest';
import { Hub } from '../src/db.js';
import { classify, parseCsv } from '../src/domain/money.js';
import { runReminders } from '../src/jobs.js';
import { createApp } from '../src/server.js';
import { seedDemo } from '../src/seed.js';
import { loadConfig } from '../src/config.js';
import { Notion, mapStatus, syncNotion } from '../src/integrations/notion.js';

const H = 3_600_000;

describe('compta', () => {
  it('range les mouvements : client, monteur, outil, tournage, sinon à vérifier', () => {
    const c = ['Client Finance'], m = ['Inès'];
    expect(classify({ date: '2026-10-03', label: 'VIR SEPA CLIENT FINANCE FACT 1', amount: 1500 }, c, m)).toMatchObject({ cat: 'client', who: 'Client Finance' });
    expect(classify({ date: '2026-10-20', label: 'VIR INES MONTAGE', amount: -375 }, c, m)).toMatchObject({ cat: 'monteur', who: 'Inès' });
    expect(classify({ date: '2026-10-01', label: 'PRLV NOTION LABS', amount: -10 }, c, m).cat).toBe('outil');
    expect(classify({ date: '2026-10-12', label: 'CB PEERSPACE', amount: -90 }, c, m).cat).toBe('tournage');
    expect(classify({ date: '2026-10-17', label: 'CB AMAZON 17/10', amount: -63 }, c, m).cat).toBe('check');
    expect(classify({ date: '2026-10-17', label: 'CB AMAZON 21/10', amount: -20 }, c, m, { 'cb amazon': 'outil' }).cat).toBe('outil');
  });

  it('lit un export CSV de banque (date française, débit / crédit ou montant)', () => {
    expect(parseCsv('Date;Libellé;Montant\n02/10/2026;VIR CLIENT FINANCE;1 500,00\n05/10/2026;"PRLV NOTION; LABS";-10,00\n')).toEqual([
      { date: '2026-10-02', label: 'VIR CLIENT FINANCE', amount: 1500 },
      { date: '2026-10-05', label: 'PRLV NOTION; LABS', amount: -10 },
    ]);
    expect(parseCsv('date,description,debit,credit\n2026-10-04,CB STUDIO,45,\n2026-10-05,VIR CLIENT,,1200\n')).toEqual([
      { date: '2026-10-04', label: 'CB STUDIO', amount: -45 },
      { date: '2026-10-05', label: 'VIR CLIENT', amount: 1200 },
    ]);
  });

  it('import sans doublons, et le rangement à la main est retenu', () => {
    const hub = new Hub(':memory:');
    hub.addClient('Client Immo', 2000);
    const rows = [{ date: '2026-10-17', label: 'CB AMAZON 17/10', amount: -63 }];
    expect(hub.importTx(rows)).toBe(1);
    expect(hub.importTx(rows)).toBe(0);
    hub.recategorize(hub.transactions()[0]!.id, 'outil');
    hub.importTx([{ date: '2026-10-25', label: 'CB AMAZON 25/10', amount: -12 }]);
    expect(hub.transactions().map((t) => t.cat)).toEqual(['outil', 'outil']);
  });
});

describe('vidéos', () => {
  const setup = () => {
    const hub = new Hub(':memory:');
    const c = hub.addClient('Client Finance', 1500), c2 = hub.addClient('Client Immo', 2000), m = hub.addMonteur('Yanis', 25);
    return { hub, c, c2, m };
  };

  it('validation et demande de modif', () => {
    const { hub, c, m } = setup();
    const id = hub.addVideo({ client_id: c.id, title: 'A', status: 'avalider', monteur_id: m.id });
    expect(() => hub.validate(hub.addVideo({ client_id: c.id, title: 'B', status: 'montage' }))).toThrow();
    hub.requestChange(id, 'hook trop long');
    expect(hub.video(id)).toMatchObject({ status: 'modif', comment: 'hook trop long' });
    expect(hub.validate(id)).toMatchObject({ status: 'valide', comment: null });
    expect(hub.video(id)!.validated_at).toBeTypeOf('number');
  });

  it('réserver un spot ajoute la location en dépense « Tournage » (une seule fois)', () => {
    const { hub, c } = setup();
    const t = hub.addTournage({ code: 'T6', client_id: c.id, date: new Date(2026, 9, 25, 14).getTime(), hours: 3, spot_name: null, spot_place: null, spot_price: null });
    hub.bookSpot(t, { name: 'Le Cabinet', place: 'Paris 9e', price: 40 });
    hub.bookSpot(t, { name: 'Loft', place: 'Paris 18e', price: 35 });
    expect(hub.transactions()).toMatchObject([{ date: '2026-10-25', amount: -105, cat: 'tournage' }]);
    expect(hub.tournages()[0]).toMatchObject({ spot_name: 'Loft' });
  });

  it('relances : client après 48 h sans validation, monteur en retard, pas deux fois de suite', async () => {
    const { hub, c, m } = setup();
    const now = Date.now();
    hub.addVideo({ client_id: c.id, title: 'A', status: 'avalider', sent_at: now - 50 * H });
    hub.addVideo({ client_id: c.id, title: 'B', status: 'avalider', sent_at: now - 10 * H });
    hub.addVideo({ client_id: c.id, title: 'C', status: 'montage', monteur_id: m.id, due_at: now - 2 * H });
    const sent: string[] = [];
    const notify = async (t: string) => { sent.push(t); };
    expect(await runReminders(hub, notify, now)).toEqual({ clients: 1, monteurs: 1 });
    expect(await runReminders(hub, notify, now + H)).toEqual({ clients: 0, monteurs: 0 });
    expect(sent).toHaveLength(2);
    expect(hub.events().map((e) => e.kind).sort()).toEqual(['relance-client', 'relance-monteur']);
  });
});

describe('serveur', () => {
  const cfg = loadConfig({ ADMIN_PASSWORD: 'secret-adrien', SESSION_SECRET: 'une-longue-phrase-secrete' });

  it('le hub est protégé par mot de passe', async () => {
    const hub = new Hub(':memory:');
    const app = createApp(hub, cfg, async () => {});
    expect((await app.request('/api/state')).status).toBe(401);
    const bad = await app.request('/login', { method: 'POST', body: new URLSearchParams({ password: 'non' }) });
    expect(bad.status).toBe(401);
    const ok = await app.request('/login', { method: 'POST', body: new URLSearchParams({ password: 'secret-adrien' }) });
    expect(ok.status).toBe(302);
    const cookie = ok.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request('/api/state', { headers: { cookie } })).status).toBe(200);
  });

  it('un client ne voit et ne valide que ses vidéos', async () => {
    const hub = new Hub(':memory:');
    seedDemo(hub);
    const notes: string[] = [];
    const app = createApp(hub, cfg, async (t) => { notes.push(t); });
    const [fin, , immo] = hub.clients();
    const res = await app.request(`/api/portal/${fin!.token}`);
    const data = (await res.json()) as { videos: Array<{ client_id: number }> };
    expect(data.videos.every((v) => v.client_id === fin!.id)).toBe(true);
    const other = hub.videos(immo!.id).find((v) => v.status === 'avalider')!;
    expect((await app.request(`/api/portal/${fin!.token}/videos/${other.id}/validate`, { method: 'POST' })).status).toBe(404);
    const mine = hub.videos(fin!.id).find((v) => v.status === 'avalider')!;
    expect((await app.request(`/api/portal/${fin!.token}/videos/${mine.id}/validate`, { method: 'POST' })).status).toBe(200);
    expect(hub.video(mine.id)!.status).toBe('valide');
    expect(notes[0]).toContain('a validé');
    expect((await app.request('/api/portal/faux-lien')).status).toBe(404);
  });
});

describe('notion', () => {
  const opts = ['Idée', 'Scripting', 'À filmer', 'Filmé', 'En montage', 'Monté à valider', 'Validé', 'Planifié', 'Publié'];
  it('reconnaît les étapes du process', () => {
    expect(opts.map(mapStatus)).toEqual(['idee', 'script', 'afilmer', 'filme', 'montage', 'avalider', 'valide', 'planifie', 'publie']);
    expect(mapStatus('Modifs demandées')).toBe('modif');
    expect(mapStatus('Archives')).toBeNull();
  });

  /** Faux Notion : une base « Short Form » sous la page « Elie Attia », 2 vidéos. */
  function fakeNotion() {
    const calls: Array<{ method: string; path: string; body: any }> = [];
    const pages = [
      { id: 'p1', url: 'https://notion.so/p1', properties: { Nom: { type: 'title', title: [{ plain_text: 'Reel budget' }] }, Étape: { type: 'status', status: { name: 'Monté à valider' } }, Type: { type: 'select', select: { name: 'TOFU' } }, Monteur: { type: 'people', people: [{ name: 'Inès' }] } } },
      { id: 'p2', url: 'https://notion.so/p2', properties: { Nom: { type: 'title', title: [{ plain_text: 'Reel bourse' }] }, Étape: { type: 'status', status: { name: 'Publié' } }, 'Date de publication': { type: 'date', date: { start: '2026-10-20' } } } },
    ];
    const f = (async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.notion.com/v1', ''), body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method: init.method!, path, body });
      const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (path === '/search') return json({ results: [{ id: 'db1', title: [{ plain_text: 'Short Form' }], parent: { type: 'page_id', page_id: 'elie' }, properties: {
        Nom: { type: 'title' }, Étape: { type: 'status', status: { options: opts.map((name) => ({ name })) } }, Type: { type: 'select', select: { options: [{ name: 'TOFU' }, { name: 'MOFU' }] } },
        'Date de publication': { type: 'date' }, Monteur: { type: 'people' } } }] });
      if (path === '/pages/elie') return json({ properties: { title: { type: 'title', title: [{ plain_text: 'Elie Attia' }] } } });
      if (path === '/databases/db1/query') return json({ results: pages });
      return json({});
    }) as unknown as typeof fetch;
    return { notion: new Notion('secret_test', f), calls, pages };
  }

  it('importe les vidéos, puis suit les changements d’étape', async () => {
    const hub = new Hub(':memory:');
    const { notion, pages } = fakeNotion();
    expect(await syncNotion(hub, notion, 1000)).toEqual({ bases: 1, created: 2, updated: 0 });
    const elie = hub.clients().find((c) => c.name === 'Elie Attia')!;
    const vids = hub.videos(elie.id);
    expect(vids.map((v) => [v.title, v.status, v.tag])).toEqual(expect.arrayContaining([['Reel budget', 'avalider', 'TOFU'], ['Reel bourse', 'publie', null]]));
    expect(hub.monteurs().map((m) => m.name)).toEqual(['Inès']);
    pages[0]!.properties.Étape = { type: 'status', status: { name: 'Validé' } };
    expect(await syncNotion(hub, notion, 2000)).toEqual({ bases: 1, created: 0, updated: 1 });
    expect(hub.videos(elie.id).find((v) => v.title === 'Reel budget')!.status).toBe('valide');
  });

  it('la validation du client repart dans Notion, la modif ajoute un commentaire', async () => {
    const hub = new Hub(':memory:');
    const { notion, calls } = fakeNotion();
    await syncNotion(hub, notion);
    hub.setSetting('notion_token', 'secret_test');
    const app = createApp(hub, loadConfig({}), async () => {}, () => notion);
    const c = hub.clients()[0]!, v = hub.videos(c.id).find((x) => x.status === 'avalider')!;
    expect((await app.request(`/api/portal/${c.token}/videos/${v.id}/modif`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment: 'Coupe la fin' }) })).status).toBe(200);
    expect(calls.find((x) => x.method === 'PATCH')!.body).toEqual({ properties: { Étape: { status: { name: 'En montage' } } } });
    expect(calls.find((x) => x.path === '/comments')!.body.rich_text[0].text.content).toContain('Coupe la fin');
    expect((await app.request(`/api/portal/${c.token}/videos/${v.id}/validate`, { method: 'POST' })).status).toBe(200);
    expect(calls.filter((x) => x.method === 'PATCH').at(-1)!.body).toEqual({ properties: { Étape: { status: { name: 'Validé' } } } });
  });
});
