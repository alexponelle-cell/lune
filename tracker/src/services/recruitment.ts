import type { Candidate, RecruitmentRepo, Stage } from '../db/recruitment.js';
import type { Repo } from '../db/repo.js';
import { DAY, HOUR } from '../domain/stats.js';
import { dayKey, dayStarts } from '../domain/time.js';
import type { AgencyService, Range } from './agency.js';

export interface RecruitmentSettings {
  /** Catégorie Discord où créer les salons de test. */
  testCategoryId: string;
  /** Rôle du staff (voit les salons privés, ses messages comptent comme réponses). */
  staffRoleId: string;
  /** Rôle donné quand un test est validé. */
  newClipperRoleId: string;
  /** Salon vocal des calls. */
  callChannelId: string;
  /** Jour du call : 1 = lundi … 7 = dimanche. */
  callWeekday: number;
  callHour: number;
  callDurationMin: number;
  /** Présence validée à partir de N minutes dans le vocal. */
  callMinMinutes: number;
  /** Lien des guidelines (Drive) envoyé aux candidats. */
  guidelinesUrl: string;
  /** Apprenti : vues cumulées depuis l'arrivée. */
  apprentiViews: number;
  /** Confirmé : vues sur les 7 derniers jours. */
  confirmeWeeklyViews: number;
  /** Rémunération des recruteurs (€). */
  recruiterPerValidated: number;
  recruiterPerConfirmed: number;
  /** "À relancer" : clippers sans analyse du staff depuis N jours. */
  relanceAnalysisDays: number;
}

export const DEFAULT_RECRUITMENT: RecruitmentSettings = {
  testCategoryId: '',
  staffRoleId: '',
  newClipperRoleId: '',
  callChannelId: '',
  callWeekday: 1,
  callHour: 20,
  callDurationMin: 90,
  callMinMinutes: 15,
  guidelinesUrl: '',
  apprentiViews: 10_000,
  confirmeWeeklyViews: 200_000,
  recruiterPerValidated: 0,
  recruiterPerConfirmed: 0,
  relanceAnalysisDays: 7,
};

export type Level = 'nouveau' | 'apprenti' | 'confirme';

export const STAGE_LABEL: Record<Stage, string> = { invite: 'Invité', test: 'En test', clipper: 'Clipper', refuse: 'Refusé' };

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export class RecruitmentService {
  constructor(
    private readonly repo: Repo,
    readonly rec: RecruitmentRepo,
    private readonly agency: AgencyService,
  ) {}

  // --- Réglages ------------------------------------------------------------------

  settings(): RecruitmentSettings {
    return { ...DEFAULT_RECRUITMENT, ...this.repo.getSetting<Partial<RecruitmentSettings>>('recruitment', {}) };
  }

  saveSettings(patch: Record<string, unknown>): RecruitmentSettings {
    const current = this.settings();
    const next: Record<string, unknown> = { ...current };
    for (const [key, def] of Object.entries(DEFAULT_RECRUITMENT)) {
      const v = patch[key];
      if (v === undefined) continue;
      if (typeof def === 'number') {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) next[key] = n;
      } else next[key] = String(v ?? '').trim();
    }
    next.callWeekday = Math.min(7, Math.max(1, Math.round(Number(next.callWeekday))));
    next.callHour = Math.min(23, Math.max(0, Math.round(Number(next.callHour))));
    this.repo.setSetting('recruitment', next);
    return this.settings();
  }

  callLabel(): string {
    const s = this.settings();
    return `Call obligatoire le ${WEEKDAYS[s.callWeekday - 1]} à ${s.callHour}h · présence validée à partir de ${s.callMinMinutes} min`;
  }

  // --- Niveaux : nouveau → apprenti → confirmé ------------------------------------

  levels(now = Date.now()): Map<number, Level> {
    const s = this.settings();
    const allTime = new Map(this.agency.ranked(this.agency.range({ preset: 'all' }, now), undefined, now).map((r) => [r.clipper.id, r.views]));
    const week = new Map(this.agency.ranked(this.agency.range({ preset: '7d' }, now), undefined, now).map((r) => [r.clipper.id, r.views]));
    const out = new Map<number, Level>();
    for (const [id, views] of allTime) {
      out.set(id, (week.get(id) ?? 0) >= s.confirmeWeeklyViews ? 'confirme' : views >= s.apprentiViews ? 'apprenti' : 'nouveau');
    }
    return out;
  }

  // --- Funnel -------------------------------------------------------------------------

  private firstSeen = (p: Candidate) => p.joinedAt ?? p.createdAt;

  funnel(range: Range, opts: { recruiterId?: number; now?: number } = {}) {
    const now = opts.now ?? Date.now();
    const levels = this.levels(now);
    const tested = this.rec.testedClipperIds();
    const recruiters = new Map(this.rec.recruiters(true).map((r) => [r.id, r.name]));
    const people = this.rec
      .allPeople()
      .filter((p) => range.preset === 'all' || (this.firstSeen(p) >= range.from && this.firstSeen(p) < range.to))
      .filter((p) => opts.recruiterId === undefined || p.recruiterId === opts.recruiterId);

    const reachedTest = people.filter((p) => p.stage !== 'invite' || tested.has(p.id));
    const clippers = people.filter((p) => p.stage === 'clipper');
    const apprentis = clippers.filter((p) => levels.get(p.id) === 'apprenti' || levels.get(p.id) === 'confirme');
    const confirmes = clippers.filter((p) => levels.get(p.id) === 'confirme');
    const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
    const s = this.settings();

    return {
      stages: [
        { key: 'invite', label: 'Invités', count: people.length, rate: null, hint: 'Entrés dans le parcours' },
        { key: 'test', label: 'En test', count: reachedTest.length, rate: rate(reachedTest.length, people.length), hint: 'ont ouvert leur test' },
        { key: 'nouveau', label: 'Nouveau', count: clippers.length, rate: rate(clippers.length, reachedTest.length), hint: 'devenus clippers' },
        { key: 'apprenti', label: 'Apprenti', count: apprentis.length, rate: rate(apprentis.length, clippers.length), hint: `ont produit ≥ ${s.apprentiViews.toLocaleString('fr-FR')} vues` },
        { key: 'confirme', label: 'Confirmé', count: confirmes.length, rate: rate(confirmes.length, apprentis.length), hint: `performants · ≥ ${s.confirmeWeeklyViews.toLocaleString('fr-FR')} vues/sem` },
      ],
      people: people.map((p) => {
        const test = this.rec.currentTest(p.id);
        return {
          id: p.id,
          username: p.username,
          stage: p.stage,
          level: p.stage === 'clipper' ? levels.get(p.id) ?? 'nouveau' : null,
          recruiter: p.recruiterId ? recruiters.get(p.recruiterId) ?? null : null,
          testStatus: test?.status ?? null,
          joinedAt: this.firstSeen(p),
          validatedAt: p.validatedAt,
          channelId: p.privateChannelId,
        };
      }),
    };
  }

  // --- Recruteurs ----------------------------------------------------------------------

  recruitersReport(range: Range, now = Date.now()) {
    const s = this.settings();
    const levels = this.levels(now);
    const tested = this.rec.testedClipperIds();
    const people = this.rec.allPeople();
    return this.rec.recruiters(true).map((r) => {
      const mine = people.filter((p) => p.recruiterId === r.id);
      const inRange = mine.filter((p) => range.preset === 'all' || (this.firstSeen(p) >= range.from && this.firstSeen(p) < range.to));
      const validatedInRange = mine.filter(
        (p) => p.stage === 'clipper' && p.validatedAt !== null && p.validatedAt >= range.from && p.validatedAt < range.to,
      );
      const confirmedInRange = validatedInRange.filter((p) => levels.get(p.id) === 'confirme');
      const pay = validatedInRange.length * s.recruiterPerValidated + confirmedInRange.length * s.recruiterPerConfirmed;
      return {
        id: r.id,
        name: r.name,
        discordId: r.discordId,
        active: r.active,
        invited: inRange.length,
        inTest: inRange.filter((p) => p.stage !== 'invite' || tested.has(p.id)).length,
        validated: validatedInRange.length,
        confirmed: confirmedInRange.length,
        totalRecruits: mine.length,
        totalClippers: mine.filter((p) => p.stage === 'clipper').length,
        conversion: inRange.length ? Math.round((inRange.filter((p) => p.stage === 'clipper').length / inRange.length) * 100) : null,
        pay: Math.round(pay * 100) / 100,
      };
    });
  }

  // --- Réactivité du staff -----------------------------------------------------------------

  /** Temps moyen entre le premier message sans réponse d'un clipper et la réponse du staff. */
  responseStats(from: number, to: number) {
    const msgs = this.rec.messages(from - 7 * DAY, to);
    const delays: number[] = [];
    let channel = '';
    let pendingSince: number | null = null;
    for (const m of msgs) {
      if (m.channelId !== channel) {
        channel = m.channelId;
        pendingSince = null;
      }
      if (!m.isStaff) pendingSince ??= m.createdAt;
      else if (pendingSince !== null) {
        if (m.createdAt >= from) delays.push(m.createdAt - pendingSince);
        pendingSince = null;
      }
    }
    return { answered: delays.length, avgMs: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null };
  }

  // --- Calls ------------------------------------------------------------------------------

  calls(range: Range, now = Date.now()) {
    const s = this.settings();
    if (!s.callChannelId) return [];
    const byDiscord = new Map(this.rec.allPeople().map((p) => [p.discordId, p]));
    const out: Array<{ start: number; end: number; participants: number; validated: number; presentIds: number[]; expected: number }> = [];
    const expected = this.repo.listClippers().length;
    for (const day of dayStarts(Math.max(range.from, now - 120 * DAY), Math.min(range.to, now))) {
      const [y, m, d] = dayKey(day + 12 * HOUR).split('-').map(Number) as [number, number, number];
      const weekday = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
      if (weekday !== s.callWeekday) continue;
      const start = day + s.callHour * HOUR;
      const end = start + s.callDurationMin * 60_000;
      if (start > now) continue;
      const minutes = new Map<string, number>();
      for (const v of this.rec.voiceSessions(start, end, s.callChannelId)) {
        const overlap = Math.min(v.leftAt ?? now, end) - Math.max(v.joinedAt, start);
        if (overlap > 0) minutes.set(v.discordId, (minutes.get(v.discordId) ?? 0) + overlap / 60_000);
      }
      const present = [...minutes.entries()].filter(([, min]) => min >= s.callMinMinutes).map(([id]) => byDiscord.get(id)?.id).filter((x): x is number => x !== undefined);
      out.push({ start, end, participants: minutes.size, validated: present.length, presentIds: present, expected });
    }
    return out.reverse();
  }

  // --- Suivi ----------------------------------------------------------------------------------

  suivi(range: Range, now = Date.now()) {
    const s = this.settings();
    const people = new Map(this.rec.allPeople().map((p) => [p.id, p]));
    const name = (id: number) => people.get(id)?.username ?? '?';
    const clippers = this.repo.listClippers();
    const fb = this.feedbackStats();
    const calls = this.calls(range, now);
    const lastCall = calls[0] ?? null;

    const tests = this.rec.testsByStatus(['submitted']).map((t) => ({
      testId: t.id,
      clipperId: t.clipperId,
      username: name(t.clipperId),
      submissionUrl: t.submissionUrl,
      submittedAt: t.submittedAt,
      attempts: t.attempts,
      channelId: t.channelId,
    }));
    const request = (kind: 'inscription' | 'avis') =>
      this.rec.pendingRequests(kind).map((r) => ({ id: r.id, clipperId: r.clipperId, username: name(r.clipperId), payload: r.payload, createdAt: r.createdAt }));
    const unanswered = this.rec
      .lastMessages()
      .filter((m) => !m.isStaff && m.clipperId !== null)
      .map((m) => ({ clipperId: m.clipperId!, username: name(m.clipperId!), channelId: m.channelId, since: m.createdAt }))
      .sort((a, b) => a.since - b.since);
    const relancer = clippers
      .map((c) => ({ clipperId: c.id, username: c.username, lastAnalysisAt: fb.get(c.id)?.last ?? null }))
      .filter((c) => c.lastAnalysisAt === null || now - c.lastAnalysisAt > s.relanceAnalysisDays * DAY)
      .sort((a, b) => (a.lastAnalysisAt ?? 0) - (b.lastAnalysisAt ?? 0));
    const avis = request('avis');
    const inscriptions = request('inscription');

    const rows = clippers
      .map((c) => {
        const f = fb.get(c.id);
        const p = people.get(c.id);
        return {
          id: c.id,
          username: c.username,
          status: c.status,
          analyses: f?.count ?? 0,
          lastAnalysisAt: f?.last ?? null,
          lastFeedback: f?.message ?? null,
          callsPresent: calls.filter((call) => call.presentIds.includes(c.id)).length,
          callsTotal: calls.length,
          lastCallPresent: lastCall ? lastCall.presentIds.includes(c.id) : null,
          pending: avis.filter((a) => a.clipperId === c.id).length + unanswered.filter((u) => u.clipperId === c.id).length,
          channelId: p?.privateChannelId ?? null,
        };
      })
      .sort((a, b) => (a.lastAnalysisAt ?? 0) - (b.lastAnalysisAt ?? 0));

    return {
      kpis: {
        pending: tests.length + inscriptions.length + avis.length,
        activeClippers: clippers.length,
        lastCallPresent: lastCall ? lastCall.validated : null,
        toRelance: relancer.length,
        unanswered: unanswered.length,
      },
      toTreat: { tests, inscriptions, avis, messages: unanswered, relancer },
      rows,
      calls: calls.map(({ presentIds: _p, ...c }) => c),
      callLabel: this.callLabel(),
      relanceDays: s.relanceAnalysisDays,
    };
  }

  /** Analyses du staff par clipper = retours envoyés ("Faire un retour"). */
  feedbackStats(): Map<number, { count: number; last: number; message: string }> {
    const rows = this.repo.db
      .prepare(
        `SELECT f.clipper_id AS id, COUNT(*) AS count, MAX(f.created_at) AS last,
           (SELECT message FROM feedbacks f2 WHERE f2.clipper_id = f.clipper_id ORDER BY created_at DESC LIMIT 1) AS message
         FROM feedbacks f GROUP BY f.clipper_id`,
      )
      .all() as Array<{ id: number; count: number; last: number; message: string }>;
    return new Map(rows.map((r) => [r.id, r]));
  }

  // --- Carte "Recrutement" + "Réactivité" de la Vue Agence --------------------------------------

  agencyCards(range: Range, now = Date.now()) {
    const current = this.responseStats(range.from, range.to);
    const previous = range.prev ? this.responseStats(range.prev.from, range.prev.to) : null;
    return {
      funnel: this.funnel({ ...range, preset: 'all' }, { now }).stages,
      response: {
        avgMs: current.avgMs,
        answered: current.answered,
        prevAvgMs: previous?.avgMs ?? null,
      },
    };
  }
}
