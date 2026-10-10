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
      { ref: 'yt-member-1m', name: '1 mois de membre YouTube', description: 'Un mois d’abonnement payant à la chaîne de Josplay, offert.', price: 500 },
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
      reward: { name: '1 mois de Patreon', description: 'Accès aux replays de Josplay sur son Patreon. Les mois s’additionnent.', price: 1_000, ref: 'patreon-1m', url: '#', linkLabel: 'Voir le Patreon' },
      texts: texts('Josplay', 'son Patreon', { shopText: 'Échange tes coins contre le Patreon, un abonnement YouTube ou une prime.', heroTitle: 'Tes clips de Josplay peuvent te rapporter **300-400 € / mois**', heroCta: 'Voir ma progression',
        faq: [
          { q: 'Comment je gagne de l’argent avec TikTok ?', a: 'Avec le programme de récompenses des créateurs de TikTok : tes clips d’1 minute et plus sont payés aux vues. Il faut avoir 18 ans, 10 000 abonnés et 100 000 vues sur les 30 derniers jours. Les meilleurs clippeurs en tirent 300-400 € par mois.' },
          { q: 'Et les coins, c’est en plus ?', a: 'Oui : 1 000 vues = 10 coins, tous comptes confondus. 100 000 vues = 1 mois de Patreon offert, et ça se cumule.' },
          { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et connecte tes comptes TikTok, Instagram et YouTube.' },
          { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum pour les coins. Un compte qui démarre peut en gagner dès son premier clip.' },
        ] }),
      // Accueil riche (mise en page Loann / Cubi) dans la DA bleu pastel de Josplay
      ms: {
        rewardShort: 'Patreon',
        tierEmoji: true,
        heroLine: 'avec la monétisation TikTok, et en plus : 100 k vues = 1 mois de Patreon offert',
        heroImage: 'ms-hero-josplay.webp',
        statLeft: { badge: '💸', text: 'Tes clips sont monétisables sur TikTok' },
        statRight: { big: '100 k', text: 'vues = 1 mois de Patreon' },
        ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
        offer: { title: 'Double gain : TikTok + Josplay', text: 'TikTok te paie tes vues, Josplay t’offre le Patreon, le membre YouTube et une prime à 1 M.', side: 'Jusqu’à 300-400 € / mois' },
        timelineTitle: 'Clipper Josplay c’est',
        timeline: [
          { emoji: '✂️', title: 'Des clips', text: 'Tu choisis un passage de Josplay qui mérite d’être vu, et tu le montes à ta façon.' },
          { emoji: '📱', title: 'Tes comptes', text: 'Tu postes sur TikTok, Instagram ou YouTube Shorts. Toutes tes vues sont additionnées.' },
          { emoji: '💸', title: 'De l’argent', text: 'Tes clips d’1 min et plus sont monétisables sur TikTok : les meilleurs clippeurs en tirent 300-400 € par mois.' },
          { emoji: '🪙', title: 'Des coins', text: 'En plus, 10 coins pour 1 000 vues, comptés chaque nuit, automatiquement.' },
          { emoji: '🏆', title: 'Un classement', text: 'Chaque semaine, le top 3 des clippeurs est mis en avant sur le Discord.' },
          { emoji: '🎁', title: 'Des récompenses', text: 'Patreon, membre YouTube ou prime : tu choisis ce que tu échanges.' },
        ],
        tiersTitle: 'Et toi, quel clippeur deviendras-tu ?',
        band: '300-400 € / MOIS AVEC TIKTOK ✦ 100 K VUES = 1 MOIS DE PATREON',
        alone: { title: 'Seul', text: 'Des clips postés pour rien : pas de récompense, pas de suivi, personne pour t’aider…' },
        withUs: { title: 'Avec Josplay', lines: ['Tes vues paient : 300-400 € / mois possibles', 'Des mois de Patreon offerts', 'Un classement chaque semaine', 'Un Discord pour t’aider', 'Une commu de clippeurs'] },
        faqAside: 'Tu as encore des questions ? Pose-les sur le Discord !',
      },
    },
  },
};
