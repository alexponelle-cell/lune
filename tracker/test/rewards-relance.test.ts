import { describe, expect, it } from 'vitest';
import { complainsAboutBot, evaluateRelance, relanceMessage } from '../src/domain/relance.js';
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

describe('messages de relance et motivation', () => {
  it('niveau 1, 2, puis 3 et plus ; jamais 2 fois le même à la suite', async () => {
    const { RELANCE_1, RELANCE_2, RELANCE_3 } = await import('../src/domain/relance.js');
    const inactive = { kind: 'inactive' as const, daysSinceLastPost: 3 };
    expect(RELANCE_1).toContain(relanceMessage(inactive, 1));
    expect(RELANCE_2).toContain(relanceMessage(inactive, 2));
    expect(RELANCE_3).toContain(relanceMessage(inactive, 7));
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const m = relanceMessage(inactive, 3, prev);
      expect(m).not.toBe(prev);
      prev = m;
    }
  });

  it('motivation : toutes les phrases sortent avant de revenir, jamais 2 fois de suite', async () => {
    const { drawMotivation, MOTIVATION } = await import('../src/domain/motivation.js');
    let state = { day: '', bag: [] as number[], last: null as number | null };
    const seen: number[] = [];
    for (let i = 0; i < MOTIVATION.length * 4; i++) {
      const { index, bag } = drawMotivation(state);
      if (state.last !== null) expect(index).not.toBe(state.last);
      seen.push(index);
      state = { day: '', bag, last: index };
    }
    expect(new Set(seen.slice(0, MOTIVATION.length)).size).toBe(MOTIVATION.length);
  });
});

describe('complainsAboutBot', () => {
  it('repère les plaintes contre le bot et les « je poste déjà »', () => {
    expect(complainsAboutBot("Quelqu'un peut couper le bot je poste une vidéo par jour")).toBe(true);
    expect(complainsAboutBot('Sérieux le bug il est vraiment buggé')).toBe(true);
    expect(complainsAboutBot("arrête de me spam")).toBe(true);
    expect(complainsAboutBot("d'ici ce soir c'est posté les 5 shorts")).toBe(false);
    expect(complainsAboutBot('je finis mon montage')).toBe(false);
  });
});
