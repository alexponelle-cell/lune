import { describe, expect, it } from 'vitest';
import { DAY, dailyGains, viewsGained } from '../src/domain/stats.js';

describe('vues jour par jour', () => {
  it('un compte relu toutes les 2 nuits ne fait plus de yo-yo : les vues sont réparties sur les 2 jours', () => {
    const t0 = Date.UTC(2026, 9, 1);
    const snaps = [
      { capturedAt: t0, totalViews: 0 },
      { capturedAt: t0 + 2 * DAY, totalViews: 2000 },
      { capturedAt: t0 + 4 * DAY, totalViews: 4000 },
    ];
    expect(dailyGains(snaps, t0 + 4 * DAY, 4)).toEqual([1000, 1000, 1000, 1000]);
    // Le total sur toute la période ne change pas
    expect(viewsGained(snaps, t0, t0 + 4 * DAY)).toBe(4000);
    // Après le dernier relevé, rien n'est inventé
    expect(viewsGained(snaps, t0 + 4 * DAY, t0 + 5 * DAY)).toBe(0);
  });
});
