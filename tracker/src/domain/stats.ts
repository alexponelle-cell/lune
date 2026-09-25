export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export const WINDOWS = {
  '24h': DAY,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
} as const;
export type WindowKey = keyof typeof WINDOWS;

export function isWindowKey(v: unknown): v is WindowKey {
  return typeof v === 'string' && v in WINDOWS;
}

/** Total des vues d'un compte à un instant donné (somme des dernières vues connues de ses vidéos). */
export interface Snapshot {
  capturedAt: number;
  totalViews: number;
}

/** Dernier total connu à l'instant `t`, ou null si aucune capture n'existe avant `t`. */
export function viewsAt(snapshots: readonly Snapshot[], t: number): number | null {
  let result: number | null = null;
  for (const s of snapshots) {
    if (s.capturedAt > t) break;
    result = s.totalViews;
  }
  return result;
}

/**
 * Vues gagnées entre `from` et `to`. `snapshots` doit être trié par date croissante.
 * La première capture sert de référence : ce qui existait avant le suivi ne compte pas.
 */
export function viewsGained(snapshots: readonly Snapshot[], from: number, to: number): number {
  const first = snapshots[0];
  if (!first || to < first.capturedAt) return 0;
  const end = viewsAt(snapshots, to) ?? first.totalViews;
  const start = viewsAt(snapshots, from) ?? first.totalViews;
  return end - start;
}

export type Trend = 'up' | 'down' | 'flat';

export interface Comparison {
  /** Vues gagnées sur la fenêtre en cours (ex. dernières 24h). */
  current: number;
  /** Vues gagnées sur la fenêtre précédente (ex. les 24h d'avant). */
  previous: number;
  delta: number;
  /** Variation en %, null si la période précédente est à 0. */
  deltaPercent: number | null;
  trend: Trend;
  /** false si le suivi a commencé après le début de la fenêtre précédente (comparaison partielle). */
  complete: boolean;
}

export function buildComparison(current: number, previous: number, complete: boolean): Comparison {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    deltaPercent: previous > 0 ? (delta / previous) * 100 : null,
    trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    complete,
  };
}

export function compareWindows(snapshots: readonly Snapshot[], now: number, windowMs: number): Comparison {
  const current = viewsGained(snapshots, now - windowMs, now);
  const previous = viewsGained(snapshots, now - 2 * windowMs, now - windowMs);
  const first = snapshots[0];
  return buildComparison(current, previous, !!first && first.capturedAt <= now - 2 * windowMs);
}

/** Additionne les comparaisons de plusieurs comptes (ex. tous les comptes d'un clipper). */
export function sumComparisons(list: readonly Comparison[]): Comparison {
  const current = list.reduce((a, c) => a + c.current, 0);
  const previous = list.reduce((a, c) => a + c.previous, 0);
  return buildComparison(current, previous, list.length > 0 && list.every((c) => c.complete));
}

/** Vues gagnées par tranche de 24h glissantes, de la plus ancienne à la plus récente. */
export function dailyGains(snapshots: readonly Snapshot[], now: number, days: number): number[] {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const to = now - i * DAY;
    out.push(viewsGained(snapshots, to - DAY, to));
  }
  return out;
}
