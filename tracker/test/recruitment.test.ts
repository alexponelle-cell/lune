import { beforeEach, describe, expect, it } from 'vitest';
import { registerAccountsFromMessage } from '../src/bot/comptes.js';
import { openDatabase } from '../src/db/index.js';
import { RecruitmentRepo } from '../src/db/recruitment.js';
import { Repo } from '../src/db/repo.js';
import { DAY, HOUR } from '../src/domain/stats.js';
import { startOfWeek } from '../src/domain/time.js';
import { AgencyService } from '../src/services/agency.js';
import { RecruitmentService } from '../src/services/recruitment.js';
import { createApp } from '../src/web/server.js';

describe('recrutement', () => {
  let repo: Repo;
  let rec: RecruitmentRepo;
  let service: RecruitmentService;
  const now = Date.UTC(2026, 8, 25, 12);

  beforeEach(() => {
    repo = new Repo(openDatabase(':memory:'));
    rec = new RecruitmentRepo(repo.db);
    service = new RecruitmentService(repo, rec, new AgencyService(repo));
  });

  it("fait avancer un candidat sans jamais le faire reculer, et le garde hors des stats clippers", () => {
    const recruiter = rec.upsertRecruiter('r1', 'Gabriel', now);
    const c = rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'invite', recruiterId: recruiter.id, joinedAt: now, now });
    expect(repo.listClippers()).toHaveLength(0);
    rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'test', now });
    expect(rec.candidate(c.id)?.stage).toBe('test');
    rec.setStage(c.id, 'clipper', now);
    rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'test', now });
    expect(rec.candidate(c.id)).toMatchObject({ stage: 'clipper', recruiterId: recruiter.id, validatedAt: now });
    expect(repo.listClippers().map((x) => x.username)).toEqual(['Anto']);
  });

  it('un membre en test qui poste dans le salon COMPTES devient clipper', () => {
    const client = repo.upsertClient({ name: 'Loann', discordChannelId: 'chan', rule: { ratePer1kCents: 0, minViews: 0, capCents: null } });
    rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'test', now });
    registerAccountsFromMessage(repo, client, { discordId: 'c1', username: 'Anto' }, 'https://tiktok.com/@anto', now);
    expect(rec.candidateByDiscordId('c1')?.stage).toBe('clipper');
  });

  it('calcule le funnel et la conversion par recruteur', () => {
    const r = rec.upsertRecruiter('r1', 'Gabriel', now);
    const add = (id: string, stage: 'invite' | 'test' | 'clipper') =>
      rec.upsertCandidate({ discordId: id, username: id, stage, recruiterId: r.id, joinedAt: now - DAY, now });
    add('a', 'invite');
    add('b', 'test');
    const c = add('c', 'test');
    rec.setStage(c.id, 'clipper', now);
    rec.upsertCandidate({ discordId: 'solo', username: 'solo', stage: 'invite', joinedAt: now - DAY, now });

    const all = service.funnel({ from: 0, to: now + 1, preset: 'all', prev: null, days: 1 }, { now });
    expect(all.stages.map((s) => [s.key, s.count])).toEqual([
      ['invite', 4],
      ['test', 2],
      ['nouveau', 1],
      ['apprenti', 0],
      ['confirme', 0],
    ]);
    expect(all.stages[1]!.rate).toBe(50);

    const report = service.recruitersReport({ from: now - 7 * DAY, to: now + 1, preset: '7d', prev: null, days: 7 }, now);
    expect(report[0]).toMatchObject({ name: 'Gabriel', invited: 3, inTest: 2, validated: 1, conversion: 33 });
  });

  it('mesure le temps de réponse du staff et les messages sans réponse', () => {
    const c = rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'test', now });
    rec.setPrivateChannel(c.id, 'ch1');
    rec.logMessage('ch1', c.id, false, now - 5 * HOUR);
    rec.logMessage('ch1', c.id, false, now - 4 * HOUR); // 2e message : le délai part du 1er
    rec.logMessage('ch1', c.id, true, now - 3 * HOUR);
    rec.logMessage('ch1', c.id, false, now - HOUR); // encore sans réponse
    expect(service.responseStats(now - DAY, now + 1)).toEqual({ answered: 1, avgMs: 2 * HOUR });
    expect(rec.lastMessages().filter((m) => !m.isStaff)).toHaveLength(1);
  });

  it('valide la présence au call à partir de N minutes dans le vocal', () => {
    service.saveSettings({ callChannelId: 'voice', callWeekday: 1, callHour: 20, callDurationMin: 90, callMinMinutes: 15 });
    const a = rec.upsertCandidate({ discordId: 'a', username: 'A', stage: 'clipper', now });
    rec.upsertCandidate({ discordId: 'b', username: 'B', stage: 'clipper', now });
    const monday = startOfWeek(now); // lundi 21/09 00:00 Paris
    const callStart = monday + 20 * HOUR;
    rec.voiceJoin('a', 'voice', callStart + 5 * 60_000);
    rec.voiceLeave('a', callStart + 40 * 60_000); // 35 min → validé
    rec.voiceJoin('b', 'voice', callStart + 10 * 60_000);
    rec.voiceLeave('b', callStart + 20 * 60_000); // 10 min → pas validé
    const calls = service.calls({ from: monday, to: now, preset: '7d', prev: null, days: 7 }, now);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ participants: 2, validated: 1, presentIds: [a.id] });
  });

  it('traite tests et demandes depuis le dashboard (bot hors ligne)', async () => {
    const agency = new AgencyService(repo);
    const app = createApp({ repo, agency, recruitment: service, bot: {} });
    const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    const c = rec.upsertCandidate({ discordId: 'c1', username: 'Anto', stage: 'test', now });
    const test = rec.openTest(c.id, 'ch1', now);
    rec.submitTest(test.id, 'https://drive.google.com/x', now);

    let suivi = (await (await app.request('/api/suivi?preset=7d')).json()) as { toTreat: { tests: Array<{ username: string }> } };
    expect(suivi.toTreat.tests.map((t) => t.username)).toEqual(['Anto']);

    // À corriger : note obligatoire
    expect((await app.request(`/api/tests/${c.id}/review`, json({ note: '' }))).status).toBe(400);
    await app.request(`/api/tests/${c.id}/review`, json({ note: 'Hook trop long' }));
    expect(rec.currentTest(c.id)).toMatchObject({ status: 'changes', note: 'Hook trop long' });

    // Nouveau dépôt puis validation
    rec.submitTest(test.id, 'https://drive.google.com/y', now);
    const res = (await (await app.request(`/api/tests/${c.id}/validate`, json({}))).json()) as { warnings: string[] };
    expect(res.warnings[0]).toContain('Bot hors ligne');
    expect(rec.candidate(c.id)?.stage).toBe('clipper');
    expect(rec.currentTest(c.id)?.attempts).toBe(2);

    // Demande d'avis → retour enregistré comme analyse, demande close
    const reqId = rec.addRequest(c.id, 'avis', { url: 'https://tiktok.com/@anto/video/1' }, now);
    await app.request(`/api/requests/${reqId}/feedback`, json({ message: 'Sous-titres trop petits' }));
    suivi = (await (await app.request('/api/suivi?preset=7d')).json()) as never;
    const s = suivi as unknown as { toTreat: { avis: unknown[]; tests: unknown[] }; rows: Array<{ analyses: number; lastFeedback: string }> };
    expect(s.toTreat.avis).toHaveLength(0);
    expect(s.toTreat.tests).toHaveLength(0);
    expect(s.rows[0]).toMatchObject({ analyses: 1, lastFeedback: 'Sous-titres trop petits' });

    // Réglages : jour du call borné
    const settings = (await (await app.request('/api/recruitment/settings', { ...json({ callWeekday: 12, staffRoleId: ' 123 ' }), method: 'PUT' })).json()) as {
      callWeekday: number;
      staffRoleId: string;
    };
    expect(settings).toMatchObject({ callWeekday: 7, staffRoleId: '123' });
  });
});
