/**
 * Remplit la base avec des agences, des clippers et 60 jours d'historique simulé
 * pour tester le dashboard sans Discord ni APIs : `npm run seed` puis `npm run dev`.
 * ⚠️ À lancer uniquement sur une base de démo.
 */
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { canonicalUrl, type Platform } from '../src/domain/links.js';
import { DAY, HOUR } from '../src/domain/stats.js';
import { mockAccount } from '../src/platforms/mock.js';

const repo = new Repo(openDatabase(config.DATABASE_PATH));
const now = Date.now();
const start = now - 60 * DAY;

const rule = { ratePer1kCents: 0, minViews: 0, capCents: null };
const loann = repo.upsertClient({ name: 'Loann', rule });
const beone = repo.upsertClient({ name: 'BeOne', rule });
repo.updateClient(loann.id, { monthlyFeeCents: 150_000 });
repo.updateClient(beone.id, { monthlyFeeCents: 90_000 });

// Barème universel : primes régularité + classement ; Loann paie en plus 1 € / 1 000 vues.
repo.setRewardRule('universal', 0, {
  primeClassement: { enabled: true, topN: 3, amount: 100 },
  primeRegularite: { enabled: true, tiers: [{ postsPerDay: 1, amountPerWeek: 10 }, { postsPerDay: 2, amountPerWeek: 15 }] },
  malusStrikes: { enabled: true, perStrike: 10 },
});
repo.setRewardRule('client', loann.id, {
  base: { enabled: true, perView: 0.001 },
  primeClassement: { enabled: true, topN: 3, amount: 100 },
  malusStrikes: { enabled: true, perStrike: 10 },
});

const clippers: Array<[string, string, Array<[Platform, string]>, typeof loann]> = [
  ['100000000000000001', 'Nono', [['tiktok', 'nono.clips'], ['instagram', 'nono.clips']], loann],
  ['100000000000000002', 'Sami', [['tiktok', 'samiedits'], ['youtube', 'samiedits']], loann],
  ['100000000000000003', 'Lina', [['instagram', 'lina.cuts']], loann],
  ['100000000000000007', 'Drakofeu', [['tiktok', 'drakofeu'], ['instagram', 'drakofeu'], ['youtube', 'drakofeu']], loann],
  ['100000000000000008', 'Saiko', [['tiktok', 'saiko.edit'], ['instagram', 'saiko.edit']], loann],
  ['100000000000000004', 'Yanis', [['tiktok', 'yanis.clip'], ['instagram', 'yanis.clip'], ['youtube', 'yanisclip']], beone],
  ['100000000000000005', 'Maé', [['tiktok', 'mae.best.of']], beone],
  ['100000000000000006', 'Théo', [['youtube', 'theoshorts'], ['tiktok', 'theo.shorts']], beone],
  ['100000000000000009', 'LiZux', [['instagram', 'lizux'], ['tiktok', 'lizux']], beone],
];

let snapshots = 0;
for (const [discordId, username, accounts, client] of clippers) {
  const joined = start + (discordId.charCodeAt(17) % 5) * 7 * DAY; // arrivées échelonnées
  const clipper = repo.upsertClipper(discordId, username, joined, client.id);
  for (const [platform, handle] of accounts) {
    const { account } = repo.registerAccount({
      clipperId: clipper.id,
      clientId: client.id,
      platform,
      handle,
      url: canonicalUrl(platform, handle),
      now: joined,
    });
    for (let t = joined; t <= now; t += 6 * HOUR) {
      repo.recordCollection(account.id, mockAccount(platform, handle, t).videos, t);
      snapshots++;
    }
    repo.markAccountChecked(account.id, now, { displayName: handle });
  }
}

const mae = repo.getClipperByDiscordId('100000000000000005')!;
repo.addStrike(mae.id, 'Absente au call du lundi sans prévenir', now - 3 * DAY);
const theo = repo.getClipperByDiscordId('100000000000000006')!;
repo.addStrike(theo.id, 'Clip hors DA (citation au lieu de talk illustré)', now - 10 * DAY);
const manual = repo.createManualClipper('Bastwind', beone.id, now - 5 * DAY);
repo.updateClipper(manual.id, { status: 'inactif' });

console.log(`Seed OK : ${repo.listClients().length} agences, ${clippers.length + 1} clippers, ${snapshots} captures.`);
