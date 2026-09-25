/**
 * Score de la période sur 100, en 4 blocs :
 *  - Production  /40 : posts publiés vs objectif (posts/jour × jours)
 *  - Performance /30 : vues gagnées vs objectif (vues/jour × jours)
 *  - Régularité  /20 : jours avec au moins un post / jours de la période
 *  - Discipline  /10 : -5 par strike reçu sur la période
 */
export interface ScoreInput {
  days: number;
  posts: number;
  views: number;
  activeDays: number;
  strikes: number;
}

export interface ScoreTargets {
  postsPerDay: number;
  viewsPerDay: number;
}

export interface ScoreBreakdown {
  total: number;
  production: number;
  performance: number;
  regularite: number;
  discipline: number;
}

export const SCORE_MAX = { production: 40, performance: 30, regularite: 20, discipline: 10 } as const;

const ratio = (value: number, target: number) => (target <= 0 ? 1 : Math.min(1, Math.max(0, value / target)));

export function computeScore(input: ScoreInput, targets: ScoreTargets): ScoreBreakdown {
  const days = Math.max(1, input.days);
  const production = Math.round(SCORE_MAX.production * ratio(input.posts, targets.postsPerDay * days));
  const performance = Math.round(SCORE_MAX.performance * ratio(input.views, targets.viewsPerDay * days));
  const regularite = Math.round(SCORE_MAX.regularite * ratio(input.activeDays, Math.ceil(days)));
  const discipline = Math.max(0, SCORE_MAX.discipline - 5 * input.strikes);
  return { total: production + performance + regularite + discipline, production, performance, regularite, discipline };
}
