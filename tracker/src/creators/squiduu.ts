import type { CreatorConfig } from './types.js';

/** SQUIDUU : site sobre et sombre (gabarit « sober »), récompense = 1 mois de Squiduuverse. */
export const squiduu: CreatorConfig = {
  id: 'squiduu',
  programName: 'SQUIDUU',
  creatorName: 'SQUIDUU',
  youtube: 'SQUIDUU',
  theme: 'sober',
  // Accent : jaune du fond de sa photo de profil (à recaler si besoin)
  colors: { bg: '#0B0B0C', card: '#131315', border: '#242428', text: '#F4F4F5', muted: '#8D8D96', accent: '#FFD500', accentInk: '#0B0B0C' },
  pointsPer1000: 10,
  rewardAccount: {
    kind: 'email',
    title: 'Compte Squiduuverse',
    label: 'E-mail utilisé sur le Squiduuverse',
    placeholder: 'ton@email.com',
    badge: 'Compte Squiduuverse relié',
    deliveryHint: 'Le mois est ajouté au compte Squiduuverse lié à cet e-mail.',
  },
  reward: {
    name: '1 mois de Squiduuverse',
    description: 'Un mois d’accès au Squiduuverse. Tu peux en échanger autant que tu veux : les mois s’additionnent.',
    price: 10_000,
    ref: 'squiduuverse-1m',
    url: 'https://squiduuverse.com/',
    linkLabel: 'Découvrir le Squiduuverse',
  },
  levels: [
    { name: 'Débutant', emoji: '🌱', min: 0 },
    { name: 'Clippeur', emoji: '⚡', min: 10_000 },
    { name: 'Pro', emoji: '🔥', min: 100_000 },
    { name: 'Élite', emoji: '💎', min: 1_000_000 },
  ],
  statuses: { pending: 'En attente', delivered: 'Livrée', refunded: 'Remboursée' },
  texts: {
    heroTitle: 'Clippe SQUIDUU. Gagne des coins.',
    heroText: 'Poste des clips de SQUIDUU sur TikTok, Instagram ou YouTube. Chaque vue te rapporte des coins, que tu échanges ensuite dans la boutique.',
    heroCta: 'Commencer à clipper',
    steps: [
      { title: 'Crée ton clip', text: 'Un passage de SQUIDUU qui mérite d’être vu.' },
      { title: 'Poste-le', text: 'Sur TikTok, Instagram ou YouTube.' },
      { title: 'Gagne des coins', text: '10 coins pour 1 000 vues, tous comptes confondus.' },
      { title: 'Échange-les', text: 'Dans la boutique, quand tu as assez de coins.' },
    ],
    shopTitle: 'Récompenses',
    shopText: 'Échange tes coins dans la boutique.',
    clipTitle: 'Clipper',
    clipText: 'Poste des clips de SQUIDUU sur TikTok, Instagram ou YouTube. Tes vues sont comptées une fois par jour.',
    rankingText: 'Les clippeurs qui ont fait le plus de vues ces 7 derniers jours.',
    footer: 'SQUIDUU',
    deliveredDm: '✅ Ton échange **{item}** a été livré.',
    dmFooter: 'SQUIDUU · Clippe, gagne des coins',
  },
};
