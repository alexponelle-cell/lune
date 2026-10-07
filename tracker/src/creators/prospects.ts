import type { CreatorConfig } from './types.js';

/**
 * Maquettes pour les calls prospects : le vrai site fans (gabarit « sober » / « pop ») avec la charte du prospect,
 * servi en lecture seule sur /demo/<slug> (données d'exemple, pas de connexion). Visuels dans src/web/app/demo/.
 */
export interface Prospect {
  config: CreatorConfig;
  /** Photo / mascotte du logo et du hero. */
  photo: string;
  banner?: string;
  reward?: string;
  /** Autres objets de la boutique (en plus de config.reward). */
  items?: { ref: string; name: string; description: string; price: number }[];
}

const LEVELS = [
  { name: 'Débutant', emoji: '🌱', min: 0 },
  { name: 'Confirmé', emoji: '⚡', min: 10_000 },
  { name: 'Pro', emoji: '🔥', min: 100_000 },
  { name: 'Élite', emoji: '💎', min: 1_000_000 },
];
const STATUSES = { pending: 'En attente', delivered: 'Livré ✅', refunded: 'Remboursé' };
const EMAIL = (title: string, hint: string) => ({ kind: 'email' as const, title, label: 'Ton e-mail', placeholder: 'ton@email.com', badge: 'E-mail relié', deliveryHint: hint });

/** Textes communs : « {n} » = nom du créateur, « {r} » = récompense. */
function texts(n: string, r: string, extra: Partial<CreatorConfig['texts']> = {}): CreatorConfig['texts'] {
  return {
    heroTitle: `Clippe ${n}. **Gagne ${r}.**`,
    heroText: `Poste des clips de ${n} sur TikTok, Instagram ou YouTube. Chaque vue te rapporte des coins, que tu échanges contre ${r}.`,
    heroCta: 'Commencer à clipper',
    steps: [
      { title: 'Crée ton clip', text: `Un passage de ${n} qui mérite d’être vu.` },
      { title: 'Poste-le', text: 'Sur TikTok, Instagram ou YouTube.' },
      { title: 'Gagne des coins', text: '10 coins pour 1 000 vues, tous comptes confondus.' },
      { title: 'Échange', text: `Tes coins contre ${r}.` },
    ],
    shopTitle: 'Récompenses',
    shopText: `Échange tes coins contre ${r}.`,
    clipTitle: 'Clipper',
    clipText: `Poste des clips de ${n} sur TikTok, Instagram ou YouTube. Tes vues sont comptées chaque nuit.`,
    rankingText: 'Les clippeurs qui ont fait le plus de vues ces 7 derniers jours.',
    footer: `${n} Clipping`,
    deliveredDm: '✅ Ta récompense **{item}** a été livrée !',
    dmFooter: `${n} Clipping`,
    faq: [
      { q: 'Comment je gagne des coins ?', a: `Tu postes des clips de ${n} sur TikTok, Instagram ou YouTube. 1 000 vues = 10 coins, tous comptes confondus.` },
      { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et connecte tes comptes TikTok, Instagram et YouTube.' },
      { q: 'Quand mes vues sont-elles comptées ?', a: 'Chaque nuit. Seules les vues faites après ton inscription rapportent des coins.' },
      { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum. Un compte qui démarre peut gagner des coins dès son premier clip.' },
    ],
    finalTitle: 'Prêt à **clipper** ?',
    finalText: 'Connecte-toi avec Discord, relie tes comptes et commence à gagner des coins dès ton prochain clip.',
    ...extra,
  };
}

const base = { pointsPer1000: 10, levels: LEVELS, statuses: STATUSES, youtube: '' };

export const PROSPECTS: Record<string, Prospect> = {
  'cubi-game': {
    photo: 'cubi-pdp.png',
    reward: 'cubi-academy.png',
    config: {
      ...base,
      id: 'cubi-game',
      programName: 'CUBI GAME',
      creatorName: 'Cubi Game',
      theme: 'sober',
      // Noir & blanc, géométrie Roblox
      colors: { bg: '#FFFFFF', card: '#F4F4F4', border: '#111111', text: '#000000', muted: '#5C5C5C', accent: '#000000', accentInk: '#FFFFFF', highlight: '#000000' },
      font: 'Space Grotesk',
      logoText: 'CUBI GAME',
      rewardAccount: EMAIL('Accès Roblox Academy', 'Ton accès Roblox Academy est envoyé sur cet e-mail.'),
      reward: { name: '1 mois de Roblox Academy', description: 'Apprends à créer tes propres jeux Roblox. Les mois s’additionnent.', price: 10_000, ref: 'academy-1m', url: '#', linkLabel: 'Découvrir la Roblox Academy' },
      texts: texts('Cubi Game', 'la Roblox Academy'),
    },
  },
  croshoot: {
    photo: 'croshoot-bob.png',
    banner: 'croshoot-banner.png',
    reward: 'croshoot-bob.png',
    config: {
      ...base,
      id: 'croshoot',
      programName: 'CROSHOOT CLIPPING',
      creatorName: 'Croshoot',
      theme: 'pop',
      style: 'sticker',
      // Rouge Croshop, brun-noir #201820, accent jaune #FFB800
      colors: { bg: '#B51E32', card: '#C72B41', border: '#201820', text: '#FFFFFF', muted: '#FFD6DC', accent: '#201820', accentInk: '#FFFFFF', accent2: '#FFB800', accent3: '#E0526B', highlight: '#201820' },
      font: 'Lilita One',
      logoText: 'croshoot.',
      rewardAccount: EMAIL('Livraison de ta peluche', 'Ta peluche Bob est envoyée après confirmation de ton adresse par e-mail.'),
      reward: { name: 'Peluche Bob', description: 'La peluche officielle de Croshop (29,99 €), livrée chez toi.', price: 30_000, ref: 'bob', url: 'https://croshop.fr/', linkLabel: 'Voir sur Croshop' },
      texts: texts('Croshoot', 'la peluche Bob', { ticker: ['CLIPPE CROSHOOT', 'FAIS DES VUES', 'GAGNE BOB', 'TIKTOK', 'SHORTS', 'REELS'] }),
    },
  },
  josplay: {
    photo: 'josplay-pdp.png',
    // Pistes de récompenses (pas encore fixées avec Josplay)
    items: [
      { ref: 'yt-member-1m', name: '1 mois de membre YouTube', description: 'Un mois d’abonnement payant à la chaîne de Josplay, offert.', price: 5_000 },
      { ref: 'prime-1m', name: 'Prime 1 million de vues', description: 'Une prime en argent quand tes clips atteignent 1 million de vues.', price: 10_000 },
    ],
    config: {
      ...base,
      id: 'josplay',
      programName: 'JOSPLAY CLIPPING',
      creatorName: 'Josplay',
      theme: 'sober',
      // Bleu identitaire #7BC7EA + blanc, textes en bleu foncé pour rester lisibles
      colors: { bg: '#FFFFFF', card: '#FFFFFF', border: '#7BC7EA', text: '#1B5E80', muted: '#3F7FA0', accent: '#7BC7EA', accentInk: '#0E3A52', highlight: '#7BC7EA' },
      font: 'Fredoka',
      logoText: 'josplay',
      rewardAccount: EMAIL('Ta récompense', 'Ta récompense est envoyée sur cet e-mail.'),
      reward: { name: '1 mois de Patreon', description: 'Accès aux replays de Josplay sur son Patreon. Les mois s’additionnent.', price: 10_000, ref: 'patreon-1m', url: '#', linkLabel: 'Voir le Patreon' },
      texts: texts('Josplay', 'son Patreon', { shopText: 'Échange tes coins contre le Patreon, un abonnement YouTube ou une prime.' }),
    },
  },
};
