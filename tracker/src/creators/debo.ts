import type { CreatorConfig } from './types.js';

/**
 * DEBO PLAYS (youtube.com/@DEBO-PLAYS) : gabarit « sober ».
 * PROVISOIRE : couleurs, textes et récompense à valider avec lui (captures de sa chaîne à venir).
 */
export const debo: CreatorConfig = {
  id: 'debo',
  programName: 'DEBO PLAYS',
  creatorName: 'DEBO',
  youtube: 'DEBO-PLAYS',
  theme: 'sober',
  colors: { bg: '#0A0B10', card: '#15161D', border: '#272935', text: '#F5F6FA', muted: '#9A9CAB', accent: '#4F8CFF', accentInk: '#FFFFFF' },
  font: 'Montserrat',
  logoText: 'debo.',
  pointsPer1000: 10,
  rewardAccount: {
    kind: 'email',
    title: 'Compte de livraison',
    label: 'E-mail pour recevoir tes récompenses',
    placeholder: 'ton@email.com',
    badge: 'Compte relié',
    deliveryHint: 'Ta récompense est envoyée sur cet e-mail.',
  },
  // Récompense à définir avec DEBO : ajoutée ensuite depuis le dashboard (Boutique fans)
  reward: null,
  levels: [
    { name: 'Débutant', emoji: '🌱', min: 0 },
    { name: 'Confirmé', emoji: '⚡', min: 10_000 },
    { name: 'Pro', emoji: '🔥', min: 100_000 },
    { name: 'Élite', emoji: '💎', min: 1_000_000 },
  ],
  statuses: { pending: 'En attente', delivered: 'Livrée', refunded: 'Remboursée' },
  texts: {
    heroTitle: 'Clippe DEBO. **Gagne des coins.**',
    heroText: 'Poste des clips de DEBO sur TikTok, Instagram ou YouTube. Chaque vue te rapporte des coins, que tu échanges ensuite dans la boutique.',
    heroCta: 'Commencer à clipper',
    steps: [
      { title: 'Crée ton clip', text: 'Un passage de DEBO qui mérite d’être vu.' },
      { title: 'Poste-le', text: 'Sur TikTok, Instagram ou YouTube.' },
      { title: 'Gagne des coins', text: '10 coins pour 1 000 vues, tous comptes confondus.' },
      { title: 'Échange-les', text: 'Dans la boutique, quand tu as assez de coins.' },
    ],
    shopTitle: 'Récompenses',
    shopText: 'Échange tes coins dans la boutique.',
    clipTitle: 'Clipper',
    clipText: 'Poste des clips de DEBO sur TikTok, Instagram ou YouTube. Tes vues sont comptées une fois par jour.',
    rankingText: 'Les clippeurs qui ont fait le plus de vues ces 7 derniers jours.',
    footer: 'DEBO PLAYS',
    deliveredDm: '✅ Ta récompense **{item}** a été livrée.',
    dmFooter: 'DEBO PLAYS · Clippe, gagne des coins',
    faq: [
      { q: 'Comment je gagne des coins ?', a: 'Tu postes des clips de DEBO sur TikTok, Instagram ou YouTube. Chaque vue compte : 1 000 vues = 10 coins, tous comptes confondus.' },
      { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » dans le salon inscription et renseigne tes comptes.' },
      { q: 'Quand mes vues sont-elles comptées ?', a: 'Une fois par jour. Seules les vues faites après ton inscription rapportent des coins.' },
      { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum. Un compte qui vient de démarrer peut gagner des coins dès son premier clip.' },
    ],
    finalTitle: 'Prêt à **clipper** ?',
    finalText: 'Connecte-toi avec Discord, relie tes comptes et commence à gagner des coins dès ton prochain clip.',
  },
};
