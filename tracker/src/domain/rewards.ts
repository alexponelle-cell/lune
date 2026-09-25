/** Règle de rémunération propre à chaque client. Montants en centimes pour éviter les flottants. */
export interface RewardRule {
  /** Montant versé pour 1 000 vues. */
  ratePer1kCents: number;
  /** Vues minimum sur la période pour être payé. */
  minViews: number;
  /** Plafond par clipper et par période (null = pas de plafond). */
  capCents: number | null;
}

export function computeRewardCents(views: number, rule: RewardRule): number {
  if (views <= 0 || views < rule.minViews) return 0;
  const raw = Math.floor((views * rule.ratePer1kCents) / 1000);
  return rule.capCents == null ? raw : Math.min(raw, rule.capCents);
}

export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
