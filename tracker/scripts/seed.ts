/**
 * Remplit la base avec des clients, des clippers et 60 jours d'historique simulé
 * pour tester le dashboard sans Discord ni APIs : `npm run seed` puis `npm run dev`.
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

const loann = repo.upsertClient({ name: 'Loann', rule: { ratePer1kCents: 100, minViews: 10_000, capCents: null } });
const beone = repo.upsertClient({ name: 'BeOne', rule: { ratePer1kCents: 80, minViews: 0, capCents: 50_000 } });

const clippers: Array<[string, string, Array<[Platform, string]>, typeof loann]> = [
  ['100000000000000001', 'Nono', [['tiktok', 'nono.clips'], ['instagram', 'nono.clips']], loann],
  ['100000000000000002', 'Sami', [['tiktok', 'samiedits'], ['youtube', 'samiedits']], loann],
  ['100000000000000003', 'Lina', [['instagram', 'lina.cuts']], loann],
  ['100000000000000004', 'Yanis', [['tiktok', 'yanis.clip'], ['instagram', 'yanis.clip'], ['youtube', 'yanisclip']], beone],
  ['100000000000000005', 'Maé', [['tiktok', 'mae.best.of']], beone],
  ['100000000000000006', 'Théo', [['youtube', 'theoshorts'], ['tiktok', 'theo.shorts']], beone],
];

let snapshots = 0;
for (const [discordId, username, accounts, client] of clippers) {
  const clipper = repo.upsertClipper(discordId, username, start);
  for (const [platform, handle] of accounts) {
    const joined = start + (discordId.charCodeAt(17) % 5) * 7 * DAY; // arrivées échelonnées
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

console.log(`Seed OK : ${repo.listClients().length} clients, ${clippers.length} clippers, ${snapshots} captures.`);
