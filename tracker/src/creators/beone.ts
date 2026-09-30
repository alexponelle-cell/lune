import type { CreatorConfig } from './types.js';

/** BeOnePourcent : site coloré (gabarit « playful »), récompenses livrées dans son jeu Roblox. */
export const beone: CreatorConfig = {
  id: 'beone',
  programName: 'BEONE REWARDS',
  creatorName: 'BeOnePourcent',
  youtube: 'BeOnePourcent',
  robloxUsername: 'BeOnePourcentt',
  theme: 'playful',
  colors: { bg: '#FAFAF7', card: '#FFFFFF', border: '#EAE8DF', text: '#111111', muted: '#6E6C66', accent: '#FFD83D', accentInk: '#111111' },
  pointsPer1000: 10,
  rewardAccount: {
    kind: 'roblox',
    title: 'Compte Roblox',
    label: 'Pseudo Roblox (pour recevoir tes récompenses)',
    placeholder: 'TonPseudoRoblox',
    badge: 'Roblox relié',
    deliveryHint: 'Tu la reçois dans le jeu à ta prochaine connexion.',
  },
  reward: null,
  levels: [
    { name: 'Débutant', emoji: '🌱', min: 0 },
    { name: 'Clippeur', emoji: '⚡', min: 10_000 },
    { name: 'Pro', emoji: '🔥', min: 100_000 },
    { name: '1%', emoji: '👑', min: 1_000_000 },
  ],
  statuses: { pending: 'En route vers le jeu 🚚', delivered: 'Reçu en jeu ✅', refunded: 'Remboursé' },
  texts: {
    heroTitle: 'Fais des vues. Gagne des Coins.',
    heroText: 'Clippe BeOnePourcent, fais exploser les vues et échange tes Coins contre des récompenses Roblox.',
    heroCta: 'Commencer à clipper',
    steps: [
      { title: 'Je clippe', text: 'Un moment de BeOne' },
      { title: 'Je fais des vues', text: 'TikTok, Insta, YouTube' },
      { title: 'Je gagne des coins', text: '10 coins / 1 000 vues' },
      { title: "J'achète des gamepass", text: 'Livrés dans le jeu' },
    ],
    shopTitle: 'Récompenses',
    shopText: 'Échange tes coins contre des gamepass et objets Roblox, livrés direct dans le jeu.',
    clipTitle: 'Clippe & gagne',
    clipText: 'Poste des clips de BeOnePourcent sur TikTok, Insta ou YouTube. On suit tes vues, chaque vue te rapporte des coins.',
    rankingText: 'Les clippeurs qui ont fait le plus de vues cette semaine.',
    footer: 'BeOne Rewards · BeOnePourcent',
    deliveredDm: '✅ Ton **{item}** est arrivé dans le jeu !',
    dmFooter: 'BeOne Rewards · 🪙 Fais des vues, gagne des coins',
  },
};
