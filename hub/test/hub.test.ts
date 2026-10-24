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
    // Pas d'e-mail renseigné : Adrien est prévenu de relancer lui-même (on ne dit pas « relancé »)
    expect(hub.events().map((e) => e.kind).sort()).toEqual(['a-relancer', 'relance-monteur']);
  });

  it('relance client par e-mail avec son lien perso', async () => {
    const { hub } = setup();
    const c = hub.addClient('Client Mail', 1000, '#FCCA09', null, 'client@exemple.fr');
    hub.addVideo({ client_id: c.id, title: 'A', status: 'avalider', sent_at: Date.now() - 50 * H });
    const mails: Array<[string, string]> = [];
    await runReminders(hub, async () => {}, Date.now(), async (to, _s, text) => { mails.push([to, text]); }, 'https://hub.test');
    expect(mails[0]![0]).toBe('client@exemple.fr');
    expect(mails[0]![1]).toContain(`https://hub.test/c/${c.token}`);
    expect(hub.events()[0]!.kind).toBe('relance-client');
  });

  it('planifier, annuler une validation (15 min max)', () => {
    const { hub, c, m } = setup();
    const id = hub.addVideo({ client_id: c.id, title: 'A', status: 'avalider', monteur_id: m.id });
    expect(() => hub.plan(id, Date.now())).toThrow();
    hub.validate(id, 1000);
    expect(hub.undoValidate(id, 1000 + 60_000)).toMatchObject({ status: 'avalider', validated_at: null });
    hub.validate(id, 1000);
    expect(() => hub.undoValidate(id, 1000 + 20 * 60_000)).toThrow(/Trop tard/);
    expect(hub.plan(id, 5000)).toMatchObject({ status: 'planifie', planned_at: 5000 });
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
      { id: 'p1', url: 'https://notion.so/p1', properties: { Nom: { type: 'title', title: [{ plain_text: 'Reel budget' }] }, Étape: { type: 'status', status: { name: 'Monté à valider' } }, Type: { type: 'select', select: { name: 'TOFU' } }, Monteur: { type: 'people', people: [{ name: 'Inès' }] }, 'Lien vidéo': { type: 'url', url: 'https://drive.google.com/file/d/abc/view' }, 'Date de rendu': { type: 'date', date: { start: '2026-10-24' } } } },
      { id: 'p2', url: 'https://notion.so/p2', properties: { Nom: { type: 'title', title: [{ plain_text: 'Reel bourse' }] }, Étape: { type: 'status', status: { name: 'Publié' } }, 'Date de publication': { type: 'date', date: { start: '2026-10-20' } } } },
    ];
    const ctl = { down: false };
    const f = (async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.notion.com/v1', ''), body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method: init.method!, path, body });
      if (ctl.down && init.method === 'PATCH') return new Response('{"message":"panne"}', { status: 503 });
      const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (path === '/search') return json({ results: [{ id: 'db1', title: [{ plain_text: 'Short Form' }], parent: { type: 'page_id', page_id: 'elie' }, properties: {
        Nom: { type: 'title' }, Étape: { type: 'status', status: { options: opts.map((name) => ({ name })) } }, Type: { type: 'select', select: { options: [{ name: 'TOFU' }, { name: 'MOFU' }] } },
        'Date de publication': { type: 'date' }, 'Date de rendu': { type: 'date' }, 'Lien vidéo': { type: 'url' }, Monteur: { type: 'people' } } }] });
      if (path === '/pages/elie') return json({ properties: { title: { type: 'title', title: [{ plain_text: 'Elie Attia' }] } } });
      if (path === '/databases/db1/query') return json({ results: pages });
      return json({});
    }) as unknown as typeof fetch;
    return { notion: new Notion('secret_test', f), calls, pages, ctl };
  }

  it('importe les vidéos, puis suit les changements d’étape', async () => {
    const hub = new Hub(':memory:');
    const { notion, pages } = fakeNotion();
    expect(await syncNotion(hub, notion, 1000)).toEqual({ bases: 1, created: 2, updated: 0 });
    const elie = hub.clients().find((c) => c.name === 'Elie Attia')!;
    const vids = hub.videos(elie.id);
    expect(vids.map((v) => [v.title, v.status, v.tag])).toEqual(expect.arrayContaining([['Reel budget', 'avalider', 'TOFU'], ['Reel bourse', 'publie', null]]));
    expect(hub.monteurs().map((m) => m.name)).toEqual(['Inès']);
    const budget = vids.find((v) => v.title === 'Reel budget')!;
    expect(budget.video_url).toBe('https://drive.google.com/file/d/abc/view');
    expect(budget.due_at).toBe(Date.parse('2026-10-24'));
    // Les vidéos déjà validées / publiées dans Notion ne comptent pas dans la paie du mois
    expect(vids.every((v) => v.validated_at === null)).toBe(true);
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

  it('si Notion est en panne, le statut du hub est renvoyé ensuite et pas écrasé', async () => {
    const hub = new Hub(':memory:');
    const { notion, calls, ctl } = fakeNotion();
    await syncNotion(hub, notion);
    hub.setSetting('notion_token', 'secret_test');
    const app = createApp(hub, loadConfig({}), async () => {}, () => notion);
    const c = hub.clients()[0]!, v = hub.videos(c.id).find((x) => x.status === 'avalider')!;
    ctl.down = true;
    expect((await app.request(`/api/portal/${c.token}/videos/${v.id}/validate`, { method: 'POST' })).status).toBe(200);
    expect(hub.video(v.id)!.notion_push).toBe('valide');
    await syncNotion(hub, notion); // Notion dit encore « Monté à valider » et refuse l'écriture
    expect(hub.video(v.id)!.status).toBe('valide');
    ctl.down = false;
    await syncNotion(hub, notion);
    expect(hub.video(v.id)!.notion_push).toBeNull();
    expect(calls.filter((x) => x.method === 'PATCH').at(-1)!.body).toEqual({ properties: { Étape: { status: { name: 'Validé' } } } });
  });
});

describe('serveur (suite)', () => {
  const cfg = loadConfig({});
  it('refuse de démarrer avec un mot de passe mais sans SESSION_SECRET', () => {
    expect(() => createApp(new Hub(':memory:'), loadConfig({ ADMIN_PASSWORD: 'secret-adrien' }), async () => {})).toThrow(/SESSION_SECRET/);
  });

  it('ajoute / modifie un client et un monteur', async () => {
    const hub = new Hub(':memory:'), app = createApp(hub, cfg, async () => {});
    const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/api/clients', { name: 'Elie Attia', fee: 1500, email: 'elie@exemple.fr', instagram: '@elie' })).status).toBe(200);
    expect((await post('/api/clients', { name: 'Elie Attia', fee: 1 })).status).toBe(400);
    const c = hub.clients()[0]!;
    expect(c).toMatchObject({ fee: 1500, email: 'elie@exemple.fr', instagram: 'elie' });
    await post(`/api/clients/${c.id}`, { name: 'Elie Attia', fee: 1800, email: '', instagram: '' });
    expect(hub.clients()[0]).toMatchObject({ fee: 1800, email: null });
    await post('/api/monteurs', { name: 'Inès', rate: 25, slack: 'U123' });
    await post(`/api/monteurs/${hub.monteurs()[0]!.id}`, { name: 'Inès', rate: 30, slack: '' });
    expect(hub.monteurs()[0]).toMatchObject({ rate: 30, slack: null });
    // Relance de paiement sans e-mail : erreur claire, rien n'est faussement « envoyé »
    const r = await post(`/api/clients/${c.id}/remind-invoice`, { month: 'octobre 2026', amount: 1800 });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('e-mail');
  });

  it('le client voit le lien de sa vidéo mais pas la page Notion, et peut annuler', async () => {
    const hub = new Hub(':memory:'), app = createApp(hub, cfg, async () => {});
    const c = hub.addClient('Elie', 1000);
    const id = hub.addVideo({ client_id: c.id, title: 'A', status: 'avalider', url: 'https://notion.so/prive', video_url: 'https://drive.google.com/x', notion_id: 'p1' });
    const data = (await (await app.request(`/api/portal/${c.token}`)).json()) as { videos: Array<Record<string, unknown>> };
    expect(data.videos[0]).toMatchObject({ video_url: 'https://drive.google.com/x' });
    expect(data.videos[0]!.url).toBeUndefined();
    expect(data.videos[0]!.notion_id).toBeUndefined();
    await app.request(`/api/portal/${c.token}/videos/${id}/validate`, { method: 'POST' });
    expect((await app.request(`/api/portal/${c.token}/videos/${id}/undo`, { method: 'POST' })).status).toBe(200);
    expect(hub.video(id)!.status).toBe('avalider');
  });
});

describe('banque et agenda', () => {
  it('lit un agenda Google (.ics) : heure de Paris, journée entière, lignes coupées, annulés ignorés', async () => {
    const { parseIcs } = await import('../src/integrations/calendar.js');
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261025T140000', 'DTEND;TZID=Europe/Paris:20261025T170000', 'SUMMARY:Tournage T6 Elie', 'LOCATION:Studio\\, Paris 9e', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261028T090000Z', 'SUMMARY:Call Sabrina avec un titre tr', ' ès long', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:Férié', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261029T090000Z', 'SUMMARY:Annulé', 'STATUS:CANCELLED', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const ev = parseIcs(ics);
    expect(ev.map((e) => e.title)).toEqual(['Tournage T6 Elie', 'Call Sabrina avec un titre très long', 'Férié']);
    expect(ev[0]).toMatchObject({ start: Date.UTC(2026, 9, 25, 13), place: 'Studio, Paris 9e', allDay: false }); // 14 h à Paris = 13 h UTC (heure d'hiver le 25 oct)
    expect(ev[1]!.start).toBe(Date.UTC(2026, 9, 28, 9));
    expect(ev[2]).toMatchObject({ allDay: true, start: Date.UTC(2026, 9, 31, 23) });
  });

  it('Qonto : importe les mouvements (débit / crédit), sans doublon à la synchro suivante', async () => {
    const { Qonto, syncQonto } = await import('../src/integrations/qonto.js');
    const seen: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push(String((init.headers as Record<string, string>).authorization));
      const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (url.includes('/organization')) return json({ organization: { bank_accounts: [{ id: 'acc1', iban: 'FR76' }] } });
      return json({ transactions: [
        { transaction_id: 't1', amount: 1500, side: 'credit', label: 'ELIE ATTIA', settled_at: '2026-10-03T10:00:00Z' },
        { transaction_id: 't2', amount: 10, side: 'debit', label: 'NOTION LABS', settled_at: '2026-10-05T10:00:00Z' },
      ], meta: { next_page: null } });
    }) as unknown as typeof fetch;
    const hub = new Hub(':memory:');
    hub.addClient('Elie Attia', 1500);
    const q = new Qonto('agence-1234', 'cle-secrete', f);
    expect(await syncQonto(hub, q)).toEqual({ added: 2, total: 2 });
    expect(await syncQonto(hub, q)).toEqual({ added: 0, total: 2 });
    expect(hub.transactions()).toMatchObject([{ amount: 1500, cat: 'client', who: 'Elie Attia', source: 'qonto' }, { amount: -10, cat: 'outil' }]);
    expect(seen[0]).toBe('agence-1234:cle-secrete');
  });

  it('mode perso et agenda relié via le hub', async () => {
    const hub = new Hub(':memory:');
    const f = (async () => new Response('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:' + new Date(Date.now() + 86_400_000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z\nSUMMARY:Tournage\nEND:VEVENT\nEND:VCALENDAR', { status: 200 })) as unknown as typeof fetch;
    const app = createApp(hub, loadConfig({ HUB_MODE: 'perso' }), async () => {}, undefined, null, { fetchImpl: f });
    const r = await app.request('/api/calendar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics' }) });
    const j = (await r.json()) as { events: number; state: { mode: string; calendar: { events: Array<{ title: string }> } } };
    expect(j.events).toBe(1);
    expect(j.state.mode).toBe('perso');
    expect(j.state.calendar.events[0]!.title).toBe('Tournage');
    expect((await app.request('/api/calendar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://exemple.fr/a.ics' }) })).status).toBe(400);
  });
});

describe('spots par photo de référence', () => {
  const result = { style: 'Bureau boisé, lumière chaude', tags: ['bois', 'lumière chaude'], keywords: ['studio podcast bois Paris'], brief: 'Bonjour…',
    spots: [{ name: 'Studio Test', place: 'Paris 11e', pricePerHour: 45, priceText: '45 €/h', url: 'https://exemple.fr/studio', match: 88, why: 'Étagères en bois' }] };

  it('cherche avec la photo, garde le dernier résultat, refuse sans photo ni texte', async () => {
    const hub = new Hub(':memory:');
    const seen: Array<{ image?: { mediaType: string }; text: string }> = [];
    const app = createApp(hub, loadConfig({}), async () => {}, undefined, null, { findSpots: async (q) => { seen.push(q); return result; } });
    const post = (body: unknown) => app.request('/api/spots/find', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const r = await post({ image: 'data:image/jpeg;base64,AAAA', text: '', people: 2 });
    expect(r.status).toBe(200);
    expect(seen[0]!.image!.mediaType).toBe('image/jpeg');
    const st = ((await r.json()) as { state: { spotAI: boolean; spotLast: { result: typeof result } } }).state;
    expect(st.spotAI).toBe(true);
    expect(st.spotLast.result.spots[0]!.name).toBe('Studio Test');
    expect((await post({ text: '' })).status).toBe(400);
    expect((await post({ image: 'data:text/html;base64,AAAA' })).status).toBe(400);
  });

  it('sans clé Claude : fonction indiquée « à brancher »', async () => {
    const app = createApp(new Hub(':memory:'), loadConfig({}), async () => {});
    const r = await app.request('/api/spots/find', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'bois' }) });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('ANTHROPIC_API_KEY');
  });

  it('relance après une pause de la recherche web, puis lit le JSON', async () => {
    const { findSpots } = await import('../src/integrations/spotfinder.js');
    const calls: Array<{ messages: unknown[]; model: string }> = [];
    const replies = [{ stop_reason: 'pause_turn', content: [{ type: 'text', text: '…' }], parsed_output: null }, { stop_reason: 'end_turn', content: [], parsed_output: result }];
    const client = { beta: { messages: { parse: async (p: { messages: unknown[]; model: string }) => { calls.push({ ...p, messages: [...p.messages] }); return replies.shift(); } } } };
    expect(await findSpots({ text: 'bois', city: 'Paris', budget: '30-50 €/h', people: 2 }, client as never)).toEqual(result);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.model).toBe('claude-opus-5-5');
    expect(calls[1]!.messages).toHaveLength(2);
  });
});
