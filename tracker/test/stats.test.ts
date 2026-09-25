import { describe, expect, it } from 'vitest';
import { compareWindows, DAY, dailyGains, type Snapshot, sumComparisons, viewsGained } from '../src/domain/stats.js';

const now = 100 * DAY;
/** Une capture par jour : le total monte de `perDay[i]` vues le jour i. */
function series(startDay: number, perDay: number[], base = 1_000): Snapshot[] {
  let total = base;
  const out: Snapshot[] = [{ capturedAt: startDay * DAY, totalViews: total }];
  perDay.forEach((v, i) => {
    total += v;
    out.push({ capturedAt: (startDay + i + 1) * DAY, totalViews: total });
  });
  return out;
}

describe('viewsGained', () => {
  const snaps = series(90, [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);

  it('fait la différence entre deux instants', () => {
    expect(viewsGained(snaps, 98 * DAY, 100 * DAY)).toBe(900 + 1000);
  });

  it('prend la première capture comme référence (pas de vues d’avant le suivi)', () => {
    expect(viewsGained(snaps, 0, 91 * DAY)).toBe(100);
  });

  it('renvoie 0 avant le début du suivi', () => {
    expect(viewsGained(snaps, 0, 50 * DAY)).toBe(0);
    expect(viewsGained([], 0, now)).toBe(0);
  });
});

describe('compareWindows', () => {
  it('compare 24h vs les 24h d’avant', () => {
    const c = compareWindows(series(90, [0, 0, 0, 0, 0, 0, 0, 0, 1000, 1500]), now, DAY);
    expect(c).toMatchObject({ current: 1500, previous: 1000, delta: 500, deltaPercent: 50, trend: 'up', complete: true });
  });

  it('détecte une baisse', () => {
    const c = compareWindows(series(80, Array(18).fill(100).concat([2000, 500])), now, DAY);
    expect(c.trend).toBe('down');
    expect(c.deltaPercent).toBe(-75);
  });

  it('marque la comparaison comme partielle si le suivi est trop récent', () => {
    const c = compareWindows(series(95, [100, 100, 100, 100, 100]), now, 7 * DAY);
    expect(c).toMatchObject({ current: 500, previous: 0, deltaPercent: null, trend: 'up', complete: false });
  });
});

describe('sumComparisons', () => {
  it('additionne plusieurs comptes', () => {
    const a = compareWindows(series(90, Array(10).fill(100)), now, DAY);
    const b = compareWindows(series(90, Array(9).fill(50).concat([10])), now, DAY);
    expect(sumComparisons([a, b])).toMatchObject({ current: 110, previous: 150, trend: 'down' });
  });
});

describe('dailyGains', () => {
  it('découpe par tranches de 24h', () => {
    expect(dailyGains(series(95, [1, 2, 3, 4, 5]), now, 3)).toEqual([3, 4, 5]);
  });
});
