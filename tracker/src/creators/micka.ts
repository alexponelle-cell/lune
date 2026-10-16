import { PROSPECTS } from './prospects.js';
import type { CreatorConfig } from './types.js';

/**
 * Mickaël Wu (@mickaelwu) : le vrai site reprend la maquette /demo/micka (skin « micka », DA de son site « Ton dossier business »).
 * Règles fixées au call du 14 oct : 10 M de vues (100 000 coins) = sa place dans l'accompagnement ; chaque mois, le top 3
 * gagne une place à l'événement IRL / au workshop du mois (annoncé le 1er, le staff contacte les gagnants). Plus de 100 € au plus actif.
 * Stratégie : clips de son contenu gaming / divertissement, DA libre, pour amener une nouvelle audience vers son business.
 * Mot-clé #micka dans la légende (à retirer quand les connexions officielles TikTok / Instagram seront validées).
 */
const demo = PROSPECTS.micka!.config;

export const micka: CreatorConfig = {
  ...demo,
  youtube: 'mickaelwu,mickaelwubusiness,MickaëlWuAccompagnement',
  clipKeywords: ['micka', 'mickaelwu', 'mickael wu', 'mickaël wu'],
  gradeWindowDays: 30,
  monthlyPrize: 3,
  monthlyPrizeLabel: 'une place à l’événement IRL ou au workshop du mois',
  monthlyPrizeShort: 'Place à l’event IRL',
  texts: {
    ...demo.texts,
    faq: [
      { q: 'Les vues sont payées en argent ?', a: 'Non. La récompense, c’est l’accès GRATUIT à l’accompagnement de Mickaël Wu, et chaque mois des places à ses événements.' },
      { q: 'Comment j’obtiens ma place dans l’accompagnement ?', a: 'Atteins 10 millions de vues cumulées sur TikTok, Instagram et YouTube Shorts.' },
      { q: 'Et chaque mois ?', a: 'Le top 3 des clippeurs du mois gagne une place à l’événement IRL ou au workshop du mois. Le podium est annoncé le 1er dans #classement.' },
      { q: 'Je peux clipper quoi ?', a: 'Les vidéos de Mickaël Wu, surtout le gaming et le divertissement. Style libre : le but, c’est de faire un max de vues.' },
      { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et renseigne tes comptes TikTok, Instagram et YouTube.' },
    ],
  },
  ms: {
    ...demo.ms!,
    offer: { title: 'Top 3 du mois = une place à l’event IRL', text: 'Chaque mois, les 3 meilleurs clippeurs gagnent une place à l’événement IRL ou au workshop de Mickaël Wu.', side: 'Chaque mois' },
    timeline: [
      { emoji: '🎮', title: 'Clippe', text: 'Des extraits de Mickaël Wu, surtout gaming et divertissement. Style libre.' },
      { emoji: '📱', title: 'Poste', text: 'Sur tes comptes TikTok, Instagram et YouTube Shorts. Toutes tes vues sont additionnées.' },
      { emoji: '🏆', title: 'Top 3 du mois', text: 'Une place à l’événement IRL ou au workshop du mois.' },
      { emoji: '🎓', title: '10 millions de vues', text: 'Ta place GRATUITE dans l’accompagnement de Mickaël Wu.' },
    ],
    tiersTitle: 'Jusqu’où tu montes ?',
    band: 'GAGNE TA PLACE ✦ L’ACCOMPAGNEMENT DE MICKAËL WU ✦ TOP 3 DU MOIS = EVENT IRL',
    withUs: { title: 'Avec Mickaël Wu', lines: ['Ta place dans l’accompagnement', 'Le top 3 du mois invité à l’event IRL', 'Tu gardes ta TikTok Money', 'Une commu qui te pousse'] },
  },
  discord: {
    welcome: [
      '👋 **Salut et bienvenue sur Mickaël Wu Clipping !**',
      '',
      'Ici, tu peux gagner **ta place GRATUITE dans l’accompagnement de {creator}** grâce à tes clips 🔥',
      '',
      '🎁 **Comment ça marche ?**',
      'Tu fais des clips des vidéos de {creator} et tu les postes sur **tes propres comptes** TikTok, Instagram et YouTube 📱',
      '✨ Les vues des 3 réseaux sont **toutes comptées ensemble**, chaque nuit, automatiquement.',
      '🪙 **1 000 vues = {rate} coins**. **10 millions de vues = ta place GRATUITE dans l’accompagnement.**',
      '',
      '🏆 **Chaque mois**, le **top 3** gagne une place à l’**événement IRL** ou au **workshop** de {creator}.',
      '🎮 Clippe surtout son contenu **gaming / divertissement**, style libre : le but, c’est de faire un max de vues.',
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
      'Uniquement des clips des vidéos de {creator} (gaming, divertissement…), en format vertical, style libre. Mets **#micka** dans la légende, sinon le clip ne compte pas.',
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
