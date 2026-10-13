import { PROSPECTS } from './prospects.js';
import type { CreatorConfig } from './types.js';

/**
 * Mickaël Wu (@mickaelwu) : le vrai site reprend la maquette /demo/micka (skin « micka », DA de son site « Ton dossier business »).
 * Récompense : sa place dans l'accompagnement (10 M de vues = 100 000 coins, ou une des 3 autres conditions validées par le staff).
 * Mot-clé #micka dans la légende (à retirer quand les connexions officielles TikTok / Instagram seront validées).
 */
const demo = PROSPECTS.micka!.config;

export const micka: CreatorConfig = {
  ...demo,
  youtube: 'mickaelwu',
  clipKeywords: ['micka', 'mickaelwu', 'mickael wu', 'mickaël wu'],
  gradeWindowDays: 30,
  discord: {
    welcome: [
      '👋 **Salut et bienvenue sur Mickaël Wu Clipping !**',
      '',
      'Ici, tu peux gagner **ta place GRATUITE dans l’accompagnement de {creator}** grâce à tes clips 🔥',
      '',
      '🎁 **Comment ça marche ?**',
      'Tu fais des clips des vidéos de {creator} et tu les postes sur **tes propres comptes** TikTok, Instagram et YouTube 📱',
      '✨ Les vues des 3 réseaux sont **toutes comptées ensemble**, chaque nuit, automatiquement.',
      '🪙 **1 000 vues = {rate} coins**. 10 millions de vues = ta place dans l’accompagnement.',
      '',
      '🏆 **4 façons de gagner ta place** (une seule suffit) :',
      '• 10 millions de vues cumulées',
      '• Top 3 sur 3 mois',
      '• Top 10 sur 8 mois',
      '• 2 vidéos par jour pendant 90 jours (3 jours manqués max)',
      '',
      '💸 Et chaque mois : **+100 € pour le clippeur le plus actif**. Tu gardes aussi tout ce que ta TikTok Money te rapporte.',
      '',
      '😕 **Tu débutes en montage ?** Pas de panique : pose tes questions dans ❓│aide, on t’explique tout.',
      '',
      '🚀 Clique sur **➡️ Continuer** juste en dessous pour découvrir les règles 👇',
    ].join('\n'),
    rules: [
      '🎮 Bienvenue sur le serveur officiel de clipping de {creator} !',
      'Le but : créer des clips de ses vidéos et les poster sur tes comptes. 🎥',
      'Merci de respecter ces règles 👇',
      '',
      '**1️⃣・Respect** 🤝',
      'Pas d’insultes, de moqueries ni de harcèlement. Les désaccords se règlent calmement.',
      '',
      '**2️⃣・Clips** 🎥',
      'Uniquement des clips des vidéos de {creator}, en format vertical. Mets **#micka** dans la légende, sinon le clip ne compte pas.',
      '',
      '**3️⃣・Tes comptes** 📱',
      'Seuls les comptes que tu as reliés comptent, et seulement les clips postés après ton inscription.',
      '',
      '**4️⃣・Pas de triche** 🚫',
      'Achat de vues, faux comptes, clips volés = exclusion définitive.',
      '',
      '**5️⃣・Pas de pub** 📢',
      'Pas de pub ni de liens vers d’autres serveurs.',
      '',
      '✅ Clique sur **J’accepte les règles** pour continuer.',
    ].join('\n'),
  },
};
