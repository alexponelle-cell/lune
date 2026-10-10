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
    // Récompenses = les grades de membre de sa chaîne YouTube (noms et paliers à confirmer avec Josplay) + prime 1 M
    items: [
      { ref: 'yt-grade-2', name: '1 mois membre YouTube · Grade 2', description: 'Le grade au-dessus : plus d’avantages sur la chaîne de Josplay.', price: 600 },
      { ref: 'yt-grade-3', name: '1 mois membre YouTube · Grade 3', description: 'Le grade max de la chaîne de Josplay, offert.', price: 1_000 },
      { ref: 'prime-1m', name: 'Prime 1 million de vues', description: 'Une prime en argent quand tes clips atteignent 1 million de vues.', price: 10_000 },
    ],
    config: {
      ...base,
      id: 'josplay',
      programName: 'JOSPLAY CLIPPING',
      creatorName: 'Josplay',
      theme: 'sober',
      // Un seul bleu (celui de Josplay, un peu plus franc) + blanc, textes en noir / gris
      colors: { bg: '#FFFFFF', card: '#FFFFFF', border: '#CFE6F5', text: '#14202B', muted: '#5D6B78', accent: '#3AA5E0', accentInk: '#FFFFFF', highlight: '#3AA5E0' },
      font: 'Fredoka',
      logoText: 'josplay',
      rewardAccount: EMAIL('Ta récompense', 'Ta récompense est envoyée sur cet e-mail.'),
      reward: { name: '1 mois membre YouTube · Grade 1', description: 'Rejoins les membres de la chaîne de Josplay, offert. Les mois s’additionnent.', price: 300, ref: 'yt-grade-1', url: '#', linkLabel: 'Voir la chaîne' },
      texts: texts('Josplay', 'des grades de membre YouTube', {
        shopText: 'Échange tes coins contre les grades de membre de la chaîne de Josplay, ou la prime à 1 M de vues.',
        heroTitle: 'Clippe Josplay. **Fais 300-400 € / mois.**',
        heroCta: 'Voir ma progression',
        faq: [
          { q: 'Comment je gagne de l’argent avec TikTok ?', a: 'Avec le programme de récompenses des créateurs de TikTok : tes clips d’1 minute et plus sont payés aux vues. Il faut avoir 18 ans, 10 000 abonnés et 100 000 vues sur les 30 derniers jours. Les meilleurs clippeurs en tirent 300-400 € par mois.' },
          { q: 'Et les coins, c’est en plus ?', a: 'Oui : 1 000 vues = 10 coins, tous comptes confondus. Dès 30 000 vues, tu prends 1 mois de membre YouTube offert, et ça se cumule.' },
          { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et connecte tes comptes TikTok, Instagram et YouTube.' },
          { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum pour les coins. Un compte qui démarre peut en gagner dès son premier clip.' },
        ],
      }),
      // Accueil riche (mise en page Loann / Cubi) dans la DA de Josplay
      ms: {
        rewardShort: 'membre YouTube',
        tierEmoji: true,
        heroLine: 'avec la monétisation TikTok. Et en plus, Josplay t’offre ses grades de membre YouTube dès 30 k vues 🔥',
        heroImage: 'ms-hero-josplay.webp',
        statLeft: { badge: '💸', text: 'Tes clips sont monétisables sur TikTok' },
        statRight: { big: '30 k', text: 'vues = 1 mois de membre offert' },
        ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
        offer: { title: 'Double gain : TikTok + Josplay', text: 'TikTok te paie tes vues, Josplay t’offre ses grades de membre YouTube et une prime à 1 M.', side: 'Jusqu’à 300-400 € / mois' },
        timelineTitle: 'Clipper Josplay c’est',
        timeline: [
          { emoji: '✂️', title: 'Des clips qui cartonnent', text: 'Josplay sort des vidéos ultra regardées : tu prends le meilleur passage, tu le montes, ça part.' },
          { emoji: '💸', title: 'De l’argent', text: 'Tes clips d’1 min et plus sont monétisables sur TikTok : les meilleurs clippeurs en tirent 300-400 € par mois.' },
          { emoji: '🎖️', title: 'Les grades YouTube', text: 'Dès 30 k vues, 1 mois de membre offert. Plus tu clippes, plus tu montes en grade.' },
          { emoji: '💰', title: 'La prime à 1 M', text: 'Tu passes le million de vues ? Tu touches une prime en plus.' },
          { emoji: '🏆', title: 'La gloire', text: 'Chaque semaine, le top 3 des clippeurs est mis en avant sur le Discord, devant toute la commu.' },
        ],
        tiersTitle: 'Et toi, jusqu’où tu montes ?',
        band: 'CLIPPE JOSPLAY ✦ 300-400 € / MOIS AVEC TIKTOK ✦ GRADES YOUTUBE OFFERTS',
        alone: { title: 'Seul', text: 'Des clips postés pour rien : pas d’argent, pas de récompense, personne pour t’aider…' },
        withUs: { title: 'Avec Josplay', lines: ['Jusqu’à 300-400 € / mois', 'Ses grades YouTube offerts', 'Une prime à 1 M de vues', 'Le top 3 mis en avant', 'Une commu qui te pousse'] },
        faqAside: 'Tu as encore des questions ? Pose-les sur le Discord !',
      },
    },
  },
};
