import { DAY } from './stats.js';

/**
 * Barème de rémunération. Il existe à 3 niveaux (universel → agence → clipper) :
 * le plus précis qui existe s'applique en entier. Montants en euros.
 */
export interface RewardConfig {
  base: { enabled: boolean; perView: number };
  primeVues: { enabled: boolean; threshold: number; amount: number };
  primePosts: { enabled: boolean; minPosts: number; perPost: number };
  primeClassement: { enabled: boolean; topN: number; amount: number };
  /** Paliers cumulables : si la moyenne de posts/jour atteint le palier, on gagne son montant par semaine (proratisé). */
  primeRegularite: { enabled: boolean; tiers: Array<{ postsPerDay: number; amountPerWeek: number }> };
  malusStrikes: { enabled: boolean; perStrike: number };
  /** Plafond par clipper et par période (null = aucun). */
  cap: number | null;
}

export type RewardScope = 'universal' | 'client' | 'clipper';

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  base: { enabled: false, perView: 0.002 },
  primeVues: { enabled: false, threshold: 100_000, amount: 50 },
  primePosts: { enabled: false, minPosts: 30, perPost: 1 },
  primeClassement: { enabled: false, topN: 3, amount: 100 },
  primeRegularite: { enabled: false, tiers: [{ postsPerDay: 1, amountPerWeek: 10 }, { postsPerDay: 2, amountPerWeek: 15 }] },
  malusStrikes: { enabled: false, perStrike: 10 },
  cap: null,
};

/** Complète une config partielle (ex. lue en base) avec les valeurs par défaut. */
export function normalizeRewardConfig(raw: unknown): RewardConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RewardConfig>;
  const d = DEFAULT_REWARD_CONFIG;
  return {
    base: { ...d.base, ...r.base },
    primeVues: { ...d.primeVues, ...r.primeVues },
    primePosts: { ...d.primePosts, ...r.primePosts },
    primeClassement: { ...d.primeClassement, ...r.primeClassement },
    primeRegularite: {
      ...d.primeRegularite,
      ...r.primeRegularite,
      tiers: Array.isArray(r.primeRegularite?.tiers) ? r.primeRegularite.tiers : d.primeRegularite.tiers,
    },
    malusStrikes: { ...d.malusStrikes, ...r.malusStrikes },
    cap: typeof r.cap === 'number' && r.cap > 0 ? r.cap : null,
  };
}

export interface RewardInput {
  views: number;
  posts: number;
  strikes: number;
  /** Rang dans le classement de la période (1 = premier), null si non classé. */
  rank: number | null;
  /** Durée de la période en ms. */
  periodMs: number;
}

export interface RewardBreakdown {
  base: number;
  primes: number;
  malus: number;
  total: number;
  details: Array<{ label: string; amount: number }>;
}

const cents = (euros: number) => Math.round(euros * 100) / 100;

export function computeReward(input: RewardInput, config: RewardConfig): RewardBreakdown {
  const details: RewardBreakdown['details'] = [];
  const days = Math.max(1, input.periodMs / DAY);

  const base = config.base.enabled ? cents(Math.max(0, input.views) * config.base.perView) : 0;
  if (base) details.push({ label: 'Base vues', amount: base });

  let primes = 0;
  const add = (label: string, amount: number) => {
    if (amount > 0) {
      primes += amount;
      details.push({ label, amount: cents(amount) });
    }
  };
  if (config.primeVues.enabled && input.views >= config.primeVues.threshold) add('Prime vues', config.primeVues.amount);
  if (config.primePosts.enabled && input.posts >= config.primePosts.minPosts) {
    add('Prime posts', input.posts * config.primePosts.perPost);
  }
  if (config.primeClassement.enabled && input.rank !== null && input.rank <= config.primeClassement.topN) {
    add(`Prime classement (top ${config.primeClassement.topN})`, config.primeClassement.amount);
  }
  if (config.primeRegularite.enabled) {
    const avg = input.posts / days;
    for (const tier of config.primeRegularite.tiers) {
      if (avg >= tier.postsPerDay) add(`Régularité ${tier.postsPerDay}/jour`, (tier.amountPerWeek * days) / 7);
    }
  }

  const malus = config.malusStrikes.enabled ? cents(input.strikes * config.malusStrikes.perStrike) : 0;
  if (malus) details.push({ label: 'Malus strikes', amount: -malus });

  let total = Math.max(0, base + primes - malus);
  if (config.cap !== null) total = Math.min(total, config.cap);
  return { base, primes: cents(primes), malus, total: cents(total), details };
}
