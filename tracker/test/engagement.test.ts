import { describe, expect, it } from 'vitest';
import { FanRepo } from '../src/db/fans.js';
import { openDatabase } from '../src/db/index.js';
import { Repo } from '../src/db/repo.js';
import { bestSlot, clipVerdict, median, verdictMessage, weekendWindow } from '../src/domain/engagement.js';
import { AgencyService } from '../src/services/agency.js';
import { FanService } from '../src/services/fans.js';
import { momentLines } from '../src/bot/fans.js';

const DAY = 86_400_000;

describe('motivation des clippeurs : outils purs', () => {
  it('médiane, verdict des clips, meilleur créneau, fenêtre du week-end, /moments', () => {
    expect(median([1, 5, 3])).toBe(3);
    const others = [1000, 1200, 900, 1100, 1000];
    expect(clipVerdict(2500, others)).toBe('hot');
    expect(clipVerdict(200, others)).toBe('low');
    expect(clipVerdict(1000, others)).toBeNull();
    expect(clipVerdict(5000, [1000, 1000])).toBeNull(); // trop peu de clips pour comparer
    expect(verdictMessage('hot', { title: 'Mon clip', views: 2500 }, others, 0, String)).toContain('2.5×');
    // 18 h (Paris = 16 h UTC en octobre) : beaucoup plus de vues
    const at = (h: number, d: number) => Date.UTC(2026, 9, 10 + d, h - 2);
    const clips = [
      { publishedAt: at(18, 0), views: 9000 }, { publishedAt: at(19, 1), views: 8000 },
      { publishedAt: at(9, 2), views: 1000 }, { publishedAt: at(10, 3), views: 1200 },
      { publishedAt: at(12, 4), views: 900 }, { publishedAt: at(13, 5), views: 1100 },
    ];
    expect(bestSlot(clips)).toMatchObject({ from: 18, to: 21 });
    const monday = Date.UTC(2026, 9, 19, -2);
    expect(weekendWindow(monday)).toEqual({ from: monday - 54 * 3_600_000, to: monday });
    expect(momentLines('4:12 la crise de rire ; 7:30 - le clash ; un passage')).toEqual(['⏱️ **4:12** · la crise de rire', '⏱️ **7:30** · le clash', '⏱️ un passage']);
  });
});

describe('motivation des clippeurs : service', () => {
  it('récap du lundi, feedback des clips (1 fournée par jour), gagnants du défi du week-end', () => {
    const repo = new Repo(openDatabase(':memory:'));
    const fans = new FanService(repo, new FanRepo(repo.db), new AgencyService(repo), 'https://site.test/', async () => null);
    const client = repo.upsertClient({ name: 'X', rule: { ratePer1kCents: 0, minViews: 0, capCents: null } });
    fans.saveSettings({ clientId: client.id, pointsPer1000: 10, orderReview: false, accountReview: false, clipRule: false });
    const now = Date.now();
    const fan = fans.ensureFan('m1', 'Mo', now - 30 * DAY);
    fans.setAccounts(fan, { tiktok: '@mo.tt' });
    const account = repo.listAccountsForClipper(fan.id)[0]!;
    repo.db.prepare('UPDATE accounts SET created_at = ?, verified_at = ?').run(now - 30 * DAY, now - 30 * DAY);
    const vids = Array.from({ length: 6 }, (_, i) => ({ platformVideoId: `v${i}`, views: 1000, publishedAt: now - (10 + i) * DAY }));
    repo.recordCollection(account.id, [...vids, { platformVideoId: 'hot', views: 5000, publishedAt: now - 2 * DAY }, { platformVideoId: 'w1', views: 10, publishedAt: now - 3 * DAY }], now - HOUR);
    const recap = fans.weeklyRecaps(now).find((r) => r.discordId === 'm1');
    expect(recap?.text).toContain('Ton récap de la semaine');
    const fb = fans.clipFeedback(now);
    expect(fb).toHaveLength(2);
    expect(fb.some((f) => f.text.includes('5 000'))).toBe(true);
    expect(fans.clipFeedback(now)).toHaveLength(0);
    expect(fans.weekendWinners(now - 4 * DAY, now)).toHaveLength(0);
    expect(fans.weekendWinners(now - 20 * DAY, now).map((w) => w.discordId)).toEqual(['m1']);
  });
});
const HOUR = 3_600_000;
