import { describe, expect, it } from 'vitest';
import { computeReward, normalizeRewardConfig } from '../src/domain/remuneration.js';
import { computeScore } from '../src/domain/score.js';
import { DAY } from '../src/domain/stats.js';
import { dayKey, dayStarts, startOfDay, startOfWeek } from '../src/domain/time.js';

describe('computeScore', () => {
  const targets = { postsPerDay: 2, viewsPerDay: 5_000 };

  it('donne 100 à un clipper qui tient tous ses objectifs', () => {
    expect(computeScore({ days: 7, posts: 14, views: 35_000, activeDays: 7, strikes: 0 }, targets)).toEqual({
      total: 100,
      production: 40,
      performance: 30,
      regularite: 20,
      discipline: 10,
    });
  });

  it('ne garde que la discipline pour un clipper inactif', () => {
    expect(computeScore({ days: 7, posts: 0, views: 0, activeDays: 0, strikes: 0 }, targets).total).toBe(10);
  });

  it('retire 5 points de discipline par strike', () => {
    expect(computeScore({ days: 7, posts: 7, views: 17_500, activeDays: 7, strikes: 1 }, targets)).toMatchObject({
      production: 20,
      performance: 15,
      regularite: 20,
      discipline: 5,
      total: 60,
    });
  });
});

describe('computeReward', () => {
  const week = 7 * DAY;

  it("n'applique rien avec le barème par défaut", () => {
    expect(computeReward({ views: 1e6, posts: 50, strikes: 0, rank: 1, periodMs: week }, normalizeRewardConfig({})).total).toBe(0);
  });

  it('cumule base, primes et malus, puis plafonne', () => {
    const config = normalizeRewardConfig({
      base: { enabled: true, perView: 0.002 },
      primeVues: { enabled: true, threshold: 100_000, amount: 50 },
      primeClassement: { enabled: true, topN: 3, amount: 100 },
      primeRegularite: { enabled: true, tiers: [{ postsPerDay: 1, amountPerWeek: 10 }, { postsPerDay: 2, amountPerWeek: 15 }] },
      malusStrikes: { enabled: true, perStrike: 10 },
    });
    const r = computeReward({ views: 120_000, posts: 14, strikes: 1, rank: 2, periodMs: week }, config);
    // 240 (base) + 50 (vues) + 100 (top 3) + 10 + 15 (2 paliers) − 10 (strike)
    expect(r).toMatchObject({ base: 240, primes: 175, malus: 10, total: 405 });
    expect(computeReward({ views: 120_000, posts: 14, strikes: 1, rank: 2, periodMs: week }, { ...config, cap: 300 }).total).toBe(300);
  });

  it('proratise la prime régularité sur la durée', () => {
    const config = normalizeRewardConfig({ primeRegularite: { enabled: true, tiers: [{ postsPerDay: 1, amountPerWeek: 70 }] } });
    expect(computeReward({ views: 0, posts: 30, strikes: 0, rank: null, periodMs: 30 * DAY }, config).total).toBe(300);
  });
});

describe('journées à l’heure de Paris', () => {
  it('coupe les jours à minuit heure de Paris', () => {
    const t = Date.UTC(2026, 8, 24, 22, 30); // 25/09 00:30 à Paris (UTC+2)
    expect(dayKey(t)).toBe('2026-09-25');
    expect(startOfDay(t)).toBe(Date.UTC(2026, 8, 24, 22, 0));
  });

  it('fait commencer la semaine le lundi', () => {
    const friday = Date.UTC(2026, 8, 25, 12);
    expect(dayKey(startOfWeek(friday))).toBe('2026-09-21');
  });

  it('gère le passage à l’heure d’hiver', () => {
    const days = dayStarts(Date.UTC(2026, 9, 24, 12), Date.UTC(2026, 9, 27, 12)).map((d) => dayKey(d + 3_600_000));
    expect(days).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });
});
