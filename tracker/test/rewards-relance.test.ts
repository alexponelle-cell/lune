import { describe, expect, it } from 'vitest';
import { evaluateRelance, relanceMessage } from '../src/domain/relance.js';
import { computeRewardCents } from '../src/domain/rewards.js';
import { DAY } from '../src/domain/stats.js';

describe('computeRewardCents', () => {
  const rule = { ratePer1kCents: 150, minViews: 10_000, capCents: 20_000 };

  it('paie au tarif du client', () => {
    expect(computeRewardCents(50_000, rule)).toBe(7_500); // 50 × 1,50 €
  });
  it('ne paie rien sous le minimum', () => {
    expect(computeRewardCents(9_999, rule)).toBe(0);
  });
  it('applique le plafond', () => {
    expect(computeRewardCents(1_000_000, rule)).toBe(20_000);
    expect(computeRewardCents(1_000_000, { ...rule, capCents: null })).toBe(150_000);
  });
  it('ignore les vues négatives', () => {
    expect(computeRewardCents(-500, { ...rule, minViews: 0 })).toBe(0);
  });
});

describe('evaluateRelance', () => {
  const rules = { inactivityDays: 3, dropThresholdPercent: 30, dropMinPreviousViews: 1000 };
  const now = 100 * DAY;
  const base = { trackedSince: 50 * DAY, recentViews: 10_000, previousViews: 10_000, comparisonComplete: true };

  it('ne relance pas un clipper actif', () => {
    expect(evaluateRelance({ ...base, lastPostAt: now - DAY }, rules, now)).toEqual([]);
  });

  it('relance après N jours sans post', () => {
    expect(evaluateRelance({ ...base, lastPostAt: now - 4.5 * DAY }, rules, now)).toEqual([
      { kind: 'inactive', daysSinceLastPost: 4 },
    ]);
  });

  it('relance un compte jamais posté après N jours de suivi', () => {
    expect(evaluateRelance({ ...base, lastPostAt: null, trackedSince: now - 5 * DAY }, rules, now)[0]?.kind).toBe(
      'inactive',
    );
  });

  it('relance quand les vues chutent', () => {
    const r = evaluateRelance({ ...base, lastPostAt: now, recentViews: 6_000 }, rules, now);
    expect(r).toEqual([{ kind: 'views_drop', dropPercent: 40, recentViews: 6_000, previousViews: 10_000 }]);
    expect(relanceMessage(r[0]!, 0)).toContain('40');
  });

  it('ignore les baisses sur de petits volumes ou un historique partiel', () => {
    expect(evaluateRelance({ ...base, lastPostAt: now, previousViews: 500, recentViews: 0 }, rules, now)).toEqual([]);
    expect(evaluateRelance({ ...base, lastPostAt: now, recentViews: 0, comparisonComplete: false }, rules, now)).toEqual([]);
  });
});
