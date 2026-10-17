import { dayKey } from './time.js';

/** Quête affichée sur le site (progression) et récompensée par le bot (coins). */
export interface Quest {
  id: 'accounts' | 'views10k' | 'streak7';
  chip: string;
  title: string;
  text: string;
  /** Coins gagnés à la réussite (0 = récompense hors coins, ex. un rôle). */
  coins: number;
  rewardLabel?: string;
  progress: number;
  goal: number;
  done: boolean;
  unit: string;
}

export const QUEST_COINS = { accounts: 5, streak7: 100 } as const;

/** Série en cours : jours d'affilée avec au moins un clip, jusqu'à aujourd'hui (ou hier si rien encore aujourd'hui). */
export function currentStreak(days: Iterable<string>, now: number): { length: number; start: string | null } {
  const set = new Set(days);
  const DAY = 86_400_000;
  let t = now;
  if (!set.has(dayKey(t))) t -= DAY;
  let length = 0;
  let start: string | null = null;
  while (set.has(dayKey(t))) {
    length++;
    start = dayKey(t);
    t -= DAY;
  }
  return { length, start };
}

export function buildQuests(input: { platforms: number; views: number; streak: number }): Quest[] {
  const { platforms, views, streak } = input;
  return [
    { id: 'accounts', chip: 'Une seule fois', title: 'Inscris tes 3 comptes', text: 'Relie TikTok, YouTube et Instagram.', coins: QUEST_COINS.accounts, progress: Math.min(platforms, 3), goal: 3, done: platforms >= 3, unit: 'comptes' },
    { id: 'views10k', chip: 'Une seule fois', title: '10 000 vues cumulées', text: 'Passe au rang Confirmé et débloque son badge.', coins: 0, rewardLabel: 'Rang Confirmé + badge', progress: Math.min(views, 10_000), goal: 10_000, done: views >= 10_000, unit: 'vues' },
    { id: 'streak7', chip: 'Régularité', title: '1 clip par jour', text: 'Poste au moins 1 clip chaque jour pendant 7 jours. Ça se recharge à chaque série de 7.', coins: QUEST_COINS.streak7, progress: streak % 7 === 0 && streak > 0 ? 7 : streak % 7, goal: 7, done: streak >= 7, unit: 'jours' },
  ];
}
