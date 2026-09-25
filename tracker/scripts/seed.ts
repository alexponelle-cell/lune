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
import { RecruitmentRepo } from '../src/db/recruitment.js';
import { startOfWeek } from '../src/domain/time.js';
import { AgencyService } from '../src/services/agency.js';
import { RecruitmentService } from '../src/services/recruitment.js';

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

// --- Recrutement : recruteurs, candidats, tests, demandes, messages, calls --------------
const rec = new RecruitmentRepo(repo.db);
const gabriel = rec.upsertRecruiter('200000000000000001', 'Gabriel', start);
const anto = rec.upsertRecruiter('200000000000000002', 'Anto', start);
for (const d of ['100000000000000001', '100000000000000002', '100000000000000007', '100000000000000004']) {
  rec.setRecruiter(repo.getClipperByDiscordId(d)!.id, gabriel.id);
}
for (const d of ['100000000000000003', '100000000000000009']) rec.setRecruiter(repo.getClipperByDiscordId(d)!.id, anto.id);
let n = 0;
const candidate = (name: string, stage: 'invite' | 'test', recruiterId: number, daysAgo: number) =>
  rec.upsertCandidate({ discordId: `3000000000000000${String(++n).padStart(2, '0')}`, username: name, stage, recruiterId, joinedAt: now - daysAgo * DAY, now: now - daysAgo * DAY });
for (const [name, r, d] of [['Kylian', gabriel, 1], ['Sofia', gabriel, 2], ['Rayan', anto, 3], ['Inès', gabriel, 5], ['Malo', anto, 6]] as const) {
  candidate(name, 'invite', r.id, d);
}
const bastien = candidate('Bastien_dgs', 'test', gabriel.id, 3);
rec.setPrivateChannel(bastien.id, '400000000000000001');
rec.submitTest(rec.openTest(bastien.id, '400000000000000001', now - 2 * DAY).id, 'https://drive.google.com/demo-bastien', now - 2 * DAY);
const antoC = candidate('Anto_clips', 'test', anto.id, 1);
rec.setPrivateChannel(antoC.id, '400000000000000002');
rec.submitTest(rec.openTest(antoC.id, '400000000000000002', now - 3 * HOUR).id, 'https://wetransfer.com/demo', now - 2 * HOUR);
const zoe = candidate('Zoé', 'test', gabriel.id, 4);
rec.setPrivateChannel(zoe.id, '400000000000000003');
rec.openTest(zoe.id, '400000000000000003', now - 4 * DAY);

const nono = repo.getClipperByDiscordId('100000000000000001')!;
const sami = repo.getClipperByDiscordId('100000000000000002')!;
rec.setPrivateChannel(nono.id, '400000000000000010');
rec.setPrivateChannel(sami.id, '400000000000000011');
rec.logMessage('400000000000000010', nono.id, false, now - 30 * HOUR);
rec.logMessage('400000000000000010', nono.id, true, now - 26 * HOUR);
rec.logMessage('400000000000000011', sami.id, false, now - 9 * HOUR);
rec.logMessage('400000000000000011', sami.id, true, now - 4 * HOUR);
rec.logMessage('400000000000000011', sami.id, false, now - 2 * HOUR);
rec.addRequest(sami.id, 'avis', { url: 'https://www.tiktok.com/@samiedits/video/1', question: 'Le hook est assez fort ?' }, now - 5 * HOUR);
rec.addRequest(nono.id, 'inscription', { tiktok: 'https://www.tiktok.com/@nono.clips', drive: 'https://drive.google.com/nono' }, now - DAY);
repo.addFeedback(nono.id, null, 'Très bon rythme, garde ce format de hook', now - 2 * DAY);
repo.addFeedback(sami.id, null, 'Sous-titres trop petits sur mobile', now - 12 * DAY);

// Calls du lundi 20h : présences sur les 3 derniers lundis
const settings = new RecruitmentService(repo, rec, new AgencyService(repo));
settings.saveSettings({ callChannelId: '500000000000000001', guidelinesUrl: 'https://drive.google.com/guidelines' });
for (let w = 0; w < 3; w++) {
  const call = startOfWeek(now) - w * 7 * DAY + 20 * HOUR;
  if (call > now) continue;
  clippers.forEach(([discordId], i) => {
    if ((i + w) % 3 === 0) return; // absents
    rec.voiceJoin(discordId, '500000000000000001', call + 2 * 60_000);
    rec.voiceLeave(discordId, call + (i % 4 === 0 ? 8 : 50) * 60_000);
  });
}

console.log(`Seed OK : ${repo.listClients().length} agences, ${clippers.length + 1} clippers, ${snapshots} captures.`);
