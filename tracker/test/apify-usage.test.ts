import { describe, expect, it } from 'vitest';
import { apifyUsage } from '../src/platforms/apify.js';

describe('jauge Apify', () => {
  it('lit le dépensé, le plafond et la remise à zéro', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ data: { current: { monthlyUsageUsd: 16.46 }, limits: { maxMonthlyUsageUsd: 19 }, monthlyUsageCycle: { endAt: '2026-10-25T00:00:00.000Z' } } }))) as typeof fetch;
    expect(await apifyUsage('t', fake, 1)).toEqual({ used: 16.46, limit: 19, resetAt: Date.parse('2026-10-25T00:00:00.000Z') });
  });
});
