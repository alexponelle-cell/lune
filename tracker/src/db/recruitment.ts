import type { DB } from './index.js';

export type Stage = 'invite' | 'test' | 'clipper' | 'refuse';
export type TestStatus = 'open' | 'submitted' | 'changes' | 'validated' | 'refused';

export interface Candidate {
  id: number;
  discordId: string;
  username: string;
  stage: Stage;
  status: string;
  clientId: number | null;
  recruiterId: number | null;
  joinedAt: number | null;
  validatedAt: number | null;
  privateChannelId: string | null;
  driveUrl: string | null;
  createdAt: number;
}

export interface Test {
  id: number;
  clipperId: number;
  channelId: string | null;
  status: TestStatus;
  submissionUrl: string | null;
  submittedAt: number | null;
  attempts: number;
  reviewedAt: number | null;
  note: string | null;
  createdAt: number;
}

export interface Recruiter {
  id: number;
  discordId: string;
  name: string;
  active: boolean;
  createdAt: number;
}

export interface RequestRow {
  id: number;
  clipperId: number;
  kind: 'inscription' | 'avis';
  payload: Record<string, string | undefined>;
  createdAt: number;
  doneAt: number | null;
}

type Row = Record<string, any>;

const toCandidate = (r: Row): Candidate => ({
  id: r.id,
  discordId: r.discord_id,
  username: r.username,
  stage: r.stage,
  status: r.status,
  clientId: r.client_id ?? null,
  recruiterId: r.recruiter_id ?? null,
  joinedAt: r.joined_at ?? null,
  validatedAt: r.validated_at ?? null,
  privateChannelId: r.private_channel_id ?? null,
  driveUrl: r.drive_url ?? null,
  createdAt: r.created_at,
});

const toTest = (r: Row): Test => ({
  id: r.id,
  clipperId: r.clipper_id,
  channelId: r.channel_id,
  status: r.status,
  submissionUrl: r.submission_url,
  submittedAt: r.submitted_at,
  attempts: r.attempts,
  reviewedAt: r.reviewed_at,
  note: r.note,
  createdAt: r.created_at,
});

const toRecruiter = (r: Row): Recruiter => ({
  id: r.id,
  discordId: r.discord_id,
  name: r.name,
  active: r.active === 1,
  createdAt: r.created_at,
});

const STAGE_RANK: Record<Stage, number> = { invite: 0, test: 1, clipper: 2, refuse: 3 };

/** Requêtes SQL du recrutement (candidats, tests, demandes, messages, calls, recruteurs). */
export class RecruitmentRepo {
  constructor(readonly db: DB) {}

  // --- Candidats ---------------------------------------------------------------

  candidate(id: number): Candidate | undefined {
    const r = this.db.prepare('SELECT * FROM clippers WHERE id = ?').get(id);
    return r ? toCandidate(r as Row) : undefined;
  }

  candidateByDiscordId(discordId: string): Candidate | undefined {
    const r = this.db.prepare('SELECT * FROM clippers WHERE discord_id = ?').get(discordId);
    return r ? toCandidate(r as Row) : undefined;
  }

  candidateByChannel(channelId: string): Candidate | undefined {
    const r = this.db.prepare('SELECT * FROM clippers WHERE private_channel_id = ?').get(channelId);
    return r ? toCandidate(r as Row) : undefined;
  }

  /** Tout le monde passé par le parcours (candidats + clippers). */
  allPeople(): Candidate[] {
    return this.db
      .prepare('SELECT * FROM clippers ORDER BY COALESCE(joined_at, created_at) DESC')
      .all()
      .map((r) => toCandidate(r as Row));
  }

  /**
   * Crée ou fait avancer un membre dans le parcours. On ne recule jamais d'étape
   * (un clipper qui rejoue le bouton de test reste clipper).
   */
  upsertCandidate(input: {
    discordId: string;
    username: string;
    stage: Stage;
    recruiterId?: number | null;
    joinedAt?: number | null;
    now?: number;
  }): Candidate {
    const now = input.now ?? Date.now();
    const existing = this.candidateByDiscordId(input.discordId);
    if (!existing) {
      const r = this.db
        .prepare(
          `INSERT INTO clippers (discord_id, username, stage, recruiter_id, joined_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .get(input.discordId, input.username, input.stage, input.recruiterId ?? null, input.joinedAt ?? null, now);
      return toCandidate(r as Row);
    }
    const stage = STAGE_RANK[input.stage] > STAGE_RANK[existing.stage] && existing.stage !== 'refuse' ? input.stage : existing.stage;
    this.db
      .prepare(
        `UPDATE clippers SET username = ?, stage = ?, recruiter_id = COALESCE(recruiter_id, ?), joined_at = COALESCE(joined_at, ?)
         WHERE id = ?`,
      )
      .run(input.username, stage, input.recruiterId ?? null, input.joinedAt ?? null, existing.id);
    return this.candidate(existing.id)!;
  }

  setStage(id: number, stage: Stage, now = Date.now()): void {
    this.db
      .prepare(
        `UPDATE clippers SET stage = ?, validated_at = CASE WHEN ? = 'clipper' THEN COALESCE(validated_at, ?) ELSE validated_at END WHERE id = ?`,
      )
      .run(stage, stage, now, id);
  }

  setPrivateChannel(id: number, channelId: string | null): void {
    this.db.prepare('UPDATE clippers SET private_channel_id = ? WHERE id = ?').run(channelId, id);
  }

  setDrive(id: number, url: string | null): void {
    this.db.prepare('UPDATE clippers SET drive_url = ? WHERE id = ?').run(url, id);
  }

  setRecruiter(id: number, recruiterId: number | null): void {
    this.db.prepare('UPDATE clippers SET recruiter_id = ? WHERE id = ?').run(recruiterId, id);
  }

  // --- Tests -------------------------------------------------------------------

  openTest(clipperId: number, channelId: string, now = Date.now()): Test {
    const r = this.db
      .prepare('INSERT INTO tests (clipper_id, channel_id, created_at) VALUES (?, ?, ?) RETURNING *')
      .get(clipperId, channelId, now);
    return toTest(r as Row);
  }

  test(id: number): Test | undefined {
    const r = this.db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
    return r ? toTest(r as Row) : undefined;
  }

  /** Dernier test du candidat (le plus récent). */
  currentTest(clipperId: number): Test | undefined {
    const r = this.db.prepare('SELECT * FROM tests WHERE clipper_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(clipperId);
    return r ? toTest(r as Row) : undefined;
  }

  submitTest(testId: number, url: string, now = Date.now()): void {
    this.db
      .prepare("UPDATE tests SET status = 'submitted', submission_url = ?, submitted_at = ?, attempts = attempts + 1 WHERE id = ?")
      .run(url, now, testId);
  }

  reviewTest(testId: number, status: 'validated' | 'changes' | 'refused', note: string | null, now = Date.now()): void {
    this.db.prepare('UPDATE tests SET status = ?, note = ?, reviewed_at = ? WHERE id = ?').run(status, note, now, testId);
  }

  testsByStatus(statuses: readonly TestStatus[]): Test[] {
    return this.db
      .prepare(`SELECT * FROM tests WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY COALESCE(submitted_at, created_at)`)
      .all(...statuses)
      .map((r) => toTest(r as Row));
  }

  /** IDs des personnes ayant ouvert au moins un test. */
  testedClipperIds(): Set<number> {
    return new Set((this.db.prepare('SELECT DISTINCT clipper_id AS id FROM tests').all() as Array<{ id: number }>).map((r) => r.id));
  }

  // --- Demandes (/inscription, /avis) ---------------------------------------------

  addRequest(clipperId: number, kind: RequestRow['kind'], payload: RequestRow['payload'], now = Date.now()): number {
    const r = this.db
      .prepare('INSERT INTO requests (clipper_id, kind, payload, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .get(clipperId, kind, JSON.stringify(payload), now) as { id: number };
    return r.id;
  }

  pendingRequests(kind?: RequestRow['kind']): RequestRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM requests WHERE done_at IS NULL ${kind ? 'AND kind = ?' : ''} ORDER BY created_at`)
      .all(...(kind ? [kind] : [])) as Row[];
    return rows.map((r) => ({
      id: r.id,
      clipperId: r.clipper_id,
      kind: r.kind,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
      doneAt: r.done_at,
    }));
  }

  request(id: number): RequestRow | undefined {
    const r = this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Row | undefined;
    return r ? { id: r.id, clipperId: r.clipper_id, kind: r.kind, payload: JSON.parse(r.payload), createdAt: r.created_at, doneAt: r.done_at } : undefined;
  }

  closeRequest(id: number, now = Date.now()): void {
    this.db.prepare('UPDATE requests SET done_at = ? WHERE id = ?').run(now, id);
  }

  // --- Messages des salons privés ------------------------------------------------

  logMessage(channelId: string, clipperId: number | null, isStaff: boolean, at = Date.now()): void {
    this.db
      .prepare('INSERT INTO channel_messages (channel_id, clipper_id, is_staff, created_at) VALUES (?, ?, ?, ?)')
      .run(channelId, clipperId, isStaff ? 1 : 0, at);
  }

  messages(from: number, to: number): Array<{ channelId: string; clipperId: number | null; isStaff: boolean; createdAt: number }> {
    return (
      this.db
        .prepare(
          `SELECT channel_id AS channelId, clipper_id AS clipperId, is_staff AS isStaff, created_at AS createdAt
           FROM channel_messages WHERE created_at >= ? AND created_at < ? ORDER BY channel_id, created_at`,
        )
        .all(from, to) as Array<{ channelId: string; clipperId: number | null; isStaff: number; createdAt: number }>
    ).map((m) => ({ ...m, isStaff: m.isStaff === 1 }));
  }

  /** Dernier message de chaque salon privé. */
  lastMessages(): Array<{ channelId: string; clipperId: number | null; isStaff: boolean; createdAt: number }> {
    return (
      this.db
        .prepare(
          `SELECT m.channel_id AS channelId, m.clipper_id AS clipperId, m.is_staff AS isStaff, m.created_at AS createdAt
           FROM channel_messages m
           JOIN (SELECT channel_id, MAX(id) AS id FROM channel_messages GROUP BY channel_id) last ON last.id = m.id`,
        )
        .all() as Array<{ channelId: string; clipperId: number | null; isStaff: number; createdAt: number }>
    ).map((m) => ({ ...m, isStaff: m.isStaff === 1 }));
  }

  // --- Vocal ---------------------------------------------------------------------

  voiceJoin(discordId: string, channelId: string, at = Date.now()): void {
    this.voiceLeave(discordId, at);
    this.db.prepare('INSERT INTO voice_sessions (discord_id, channel_id, joined_at) VALUES (?, ?, ?)').run(discordId, channelId, at);
  }

  voiceLeave(discordId: string, at = Date.now()): void {
    this.db.prepare('UPDATE voice_sessions SET left_at = ? WHERE discord_id = ? AND left_at IS NULL').run(at, discordId);
  }

  /** Au redémarrage du bot, on ferme les sessions restées ouvertes. */
  closeOpenVoiceSessions(at = Date.now()): void {
    this.db.prepare('UPDATE voice_sessions SET left_at = ? WHERE left_at IS NULL').run(at);
  }

  voiceSessions(from: number, to: number, channelId?: string): Array<{ discordId: string; joinedAt: number; leftAt: number | null }> {
    return this.db
      .prepare(
        `SELECT discord_id AS discordId, joined_at AS joinedAt, left_at AS leftAt FROM voice_sessions
         WHERE joined_at < ? AND COALESCE(left_at, ?) > ? ${channelId ? 'AND channel_id = ?' : ''}`,
      )
      .all(to, Number.MAX_SAFE_INTEGER, from, ...(channelId ? [channelId] : [])) as Array<{
      discordId: string;
      joinedAt: number;
      leftAt: number | null;
    }>;
  }

  // --- Recruteurs ------------------------------------------------------------------

  upsertRecruiter(discordId: string, name: string, now = Date.now()): Recruiter {
    const r = this.db
      .prepare(
        `INSERT INTO recruiters (discord_id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT (discord_id) DO UPDATE SET name = excluded.name RETURNING *`,
      )
      .get(discordId, name, now);
    return toRecruiter(r as Row);
  }

  recruiters(includeInactive = false): Recruiter[] {
    return this.db
      .prepare(`SELECT * FROM recruiters ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name COLLATE NOCASE`)
      .all()
      .map((r) => toRecruiter(r as Row));
  }

  updateRecruiter(id: number, patch: { name?: string; active?: boolean }): void {
    const current = this.db.prepare('SELECT * FROM recruiters WHERE id = ?').get(id) as Row | undefined;
    if (!current) return;
    this.db
      .prepare('UPDATE recruiters SET name = ?, active = ? WHERE id = ?')
      .run(patch.name ?? current.name, patch.active === undefined ? current.active : patch.active ? 1 : 0, id);
  }

  deleteRecruiter(id: number): void {
    this.db.prepare('DELETE FROM recruiters WHERE id = ?').run(id);
  }
}
