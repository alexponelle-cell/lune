import { DAY } from './stats.js';

export interface RelanceRules {
  inactivityDays: number;
  dropThresholdPercent: number;
  dropMinPreviousViews: number;
}

export interface ClipperActivity {
  /** Date de la dernière vidéo publiée sur l'ensemble de ses comptes. */
  lastPostAt: number | null;
  /** Date d'enregistrement du premier compte suivi. */
  trackedSince: number;
  /** Vues gagnées sur la fenêtre récente (DROP_WINDOW_DAYS). */
  recentViews: number;
  /** Vues gagnées sur la fenêtre d'avant. */
  previousViews: number;
  /** true si on a assez d'historique pour comparer les deux fenêtres. */
  comparisonComplete: boolean;
}

export type RelanceReason =
  | { kind: 'inactive'; daysSinceLastPost: number }
  | { kind: 'views_drop'; dropPercent: number; recentViews: number; previousViews: number };

export type RelanceKind = RelanceReason['kind'];

export function evaluateRelance(activity: ClipperActivity, rules: RelanceRules, now: number): RelanceReason[] {
  const reasons: RelanceReason[] = [];

  const reference = activity.lastPostAt ?? activity.trackedSince;
  const idleDays = (now - reference) / DAY;
  if (idleDays >= rules.inactivityDays) {
    reasons.push({ kind: 'inactive', daysSinceLastPost: Math.floor(idleDays) });
  }

  const { recentViews, previousViews } = activity;
  if (activity.comparisonComplete && previousViews >= rules.dropMinPreviousViews && previousViews > 0) {
    const dropPercent = ((previousViews - recentViews) / previousViews) * 100;
    if (dropPercent >= rules.dropThresholdPercent) {
      reasons.push({ kind: 'views_drop', dropPercent: Math.round(dropPercent), recentViews, previousViews });
    }
  }

  return reasons;
}

const INACTIVE_MESSAGES = [
  (d: number) => `ça fait **${d} jours** qu'on n'a pas vu de nouveau clip de ta part 👀 On relance la machine ?`,
  (d: number) => `**${d} jours** sans post… l'algo oublie vite ! Balance un clip aujourd'hui 🔥`,
  (d: number) => `petit rappel : aucun clip depuis **${d} jours**. Même un seul post aujourd'hui, ça relance tout 💪`,
];

const DROP_MESSAGES = [
  (p: number) => `tes vues ont baissé de **${p} %** par rapport à la semaine d'avant 📉 Essaie de nouveaux formats / hooks !`,
  (p: number) => `**-${p} %** de vues sur la dernière période. Poste plus régulièrement pour remonter 🚀`,
];

function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length]!;
}

/** Message de relance en français. `seed` permet de varier le texte d'une relance à l'autre. */
export function relanceMessage(reason: RelanceReason, seed = Date.now()): string {
  if (reason.kind === 'inactive') return pick(INACTIVE_MESSAGES, seed)(reason.daysSinceLastPost);
  return pick(DROP_MESSAGES, seed)(reason.dropPercent);
}
