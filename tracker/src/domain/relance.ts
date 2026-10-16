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

/** 1re relance (premier jour d'inactivité constaté). */
export const RELANCE_1 = [
  "Yo bro ! Petit rappel, pense à envoyer tes clips et à rester actif dans ton salon. Même un petit message pour donner des nouvelles, c'est carré 💪",
  "Salut chef, on ne t'a pas vu très actif hier ! Pense à poster tes clips et à passer donner des nouvelles dans ton salon aujourd'hui 🔥",
  "Yo frérot, nouvelle journée ! N'oublie pas tes clips, et hésite pas à communiquer dans ton salon pour qu'on sache comment ça avance 👊",
  "Petit check-up bro ! T'as prévu de sortir des clips aujourd'hui ? Pense aussi à nous tenir au courant de ton avancée 🚀",
  "Wesh chef, j'espère que tout va bien ! Pense à rester présent dans ton salon, à envoyer tes clips et à nous donner quelques nouvelles 💯",
  "Yo ! Même si tu n'as pas encore de clips à envoyer, passe au moins nous donner des nouvelles dans ton salon. On garde le contact 🤝",
  "Bro, petit rappel pour aujourd'hui : on compte sur toi pour les clips, mais aussi pour rester actif et communiquer avec nous 🔥",
  "Salut frérot ! Pense à faire avancer tes clips aujourd'hui et à passer sur ton salon. Un petit message permet de garder tout le monde au courant 💪",
  "Yo chef, comment ça avance de ton côté ? N'oublie pas de poster tes clips et de rester présent dans ton salon, même pour nous dire où tu en es 📈",
  "Nouvelle journée, bro ! On reste régulier sur les clips et on garde une bonne communication dans le salon. À toi de jouer 🚀",
];

/** 2e relance (toujours rien depuis la 1re). */
export const RELANCE_2 = [
  "Yo bro, je reviens vers toi car je n'ai toujours pas vu de clips ni eu de nouvelles de ta part. Tout va bien ? Pense à nous tenir au courant 💪",
  "Chef, deuxième petit rappel ! On a besoin que tu avances sur tes clips, mais aussi que tu restes présent dans ton salon. Même si tu bloques, dis-le-nous 🔥",
  "Bro, toujours pas de clips ni de nouvelles depuis mon dernier message. Si tu es occupé, aucun souci, mais prends au moins un instant pour nous tenir au courant 🤝",
  "Yo frérot, faut qu'on relance la machine ! L'objectif, c'est d'être régulier sur les clips et de communiquer dans le salon. On compte sur toi 👊",
  "Petit rappel supplémentaire, chef ! On ne demande pas forcément un message toutes les cinq minutes, mais on a besoin de voir que tu es présent et impliqué dans le projet 📈",
  "Bro, la régularité ne concerne pas seulement les clips. La communication compte aussi ! Passe nous dire où tu en es et essaie de reprendre aujourd'hui 💯",
  "Yo ! On n'a toujours pas eu de nouvelles de ton côté. Si quelque chose bloque pour les clips, explique-nous la situation plutôt que de rester silencieux 💪",
  "Frérot, même si tu n'as pas encore de clips prêts, tu peux toujours passer dans ton salon pour discuter et donner des nouvelles. On veut garder le contact 🔥",
  "Chef, j'aimerais savoir où tu en es. On attend tes clips, mais aussi un petit retour de ta part pour savoir si tout avance correctement 🤝",
  "Bro, on t'a déjà relancé et on n'a toujours aucun retour. Essaie de te remettre dans le rythme : avance sur tes clips et montre-nous que tu es toujours présent dans le projet 🚀",
];

/** 3e relance et suivantes (une par jour tant qu'il ne reprend pas). */
export const RELANCE_3 = [
  "Yo bro, petit rappel quotidien ! On attend toujours de voir de l'activité de ton côté, que ce soit sur tes clips ou dans ton salon. Pense à nous donner des nouvelles 💪",
  "Salut chef, on compte toujours sur toi ! N'oublie pas que la régularité et la communication sont importantes. Essaie de reprendre le rythme aujourd'hui 🔥",
  "Yo frérot, toujours pas de nouvelles de ton côté. Pense à avancer sur tes clips et à rester présent dans ton salon, même si c'est juste pour nous tenir au courant 👊",
  "Bro, chaque journée est une nouvelle occasion de reprendre les bonnes habitudes. On attend tes clips et un peu plus de présence de ta part dans le salon 🚀",
  "Petit rappel chef ! Il est important de rester impliqué dans le projet, aussi bien en publiant tes clips qu'en communiquant avec l'équipe. On compte sur toi 🤝",
  "Yo bro, ne laisse pas le silence s'installer ! Même si tu rencontres des difficultés ou que tu manques de temps, pense à nous tenir au courant et à garder le contact 💯",
  "Salut frérot, on aimerait te voir reprendre une activité régulière. Avance sur tes clips dès que possible et passe nous donner des nouvelles dans ton salon 🔥",
  "Chef, la régularité fait toute la différence ! N'oublie pas tes clips et pense à rester présent dans le serveur pour qu'on puisse suivre ton avancée 💪",
  "Yo bro, petit rappel pour aujourd'hui : reste impliqué dans le projet, avance sur tes clips et n'hésite pas à communiquer avec nous. Chaque effort compte 📈",
  "Frérot, on attend toujours de te revoir actif ! Prends le temps d'avancer sur tes clips et de nous tenir au courant de ta situation. L'important, c'est de garder le contact 🤝",
];

const DROP_MESSAGES = [
  (p: number) => `tes vues ont baissé de **${p} %** par rapport à la semaine d'avant 📉 Essaie de nouveaux formats / hooks !`,
  (p: number) => `**-${p} %** de vues sur la dernière période. Poste plus régulièrement pour remonter 🚀`,
];

/** Au hasard dans `list`, jamais le même texte que `previous` (pas 2 messages identiques à la suite). */
export function pickDifferent(list: readonly string[], previous: string | null | undefined, random = Math.random): string {
  const choices = list.length > 1 ? list.filter((m) => m !== previous) : list;
  return choices[Math.floor(random() * choices.length) % choices.length]!;
}

/**
 * Message de relance. `level` = numéro de la relance d'inactivité depuis le dernier clip (1, 2, 3 et plus).
 * `previous` = dernier message envoyé à ce clippeur, jamais répété à la suite.
 */
export function relanceMessage(reason: RelanceReason, level = 1, previous: string | null = null, random = Math.random): string {
  if (reason.kind === 'inactive') return pickDifferent(level <= 1 ? RELANCE_1 : level === 2 ? RELANCE_2 : RELANCE_3, previous, random);
  return pickDifferent(DROP_MESSAGES.map((m) => m(reason.dropPercent)), previous, random);
}
