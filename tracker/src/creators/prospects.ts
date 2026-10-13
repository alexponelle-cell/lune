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
  micka: {
    photo: 'micka-pdp.png',
    config: {
      ...base,
      id: 'micka',
      programName: 'MICKAËL WU CLIPPING',
      creatorName: 'Mickaël Wu',
      theme: 'sober',
      // DA de son site (« Ton dossier business ») : crème, noir, orange, boutons en dégradé orange → rose
      colors: { bg: '#F5F2EC', card: '#FFFFFF', border: '#E6E1D8', text: '#111111', muted: '#6E6A64', accent: '#F07A1A', accentInk: '#111111', highlight: '#F07A1A' },
      font: 'Inter Tight',
      logoText: 'micka',
      rewardAccount: EMAIL('Ton accès', 'Ton accès à l’accompagnement est envoyé sur cet e-mail.'),
      // Ses règles : pas d'argent pour les vues, la récompense finale = l'accès GRATUIT à son accompagnement.
      // 10 M de vues = 100 000 coins (10 coins / 1 000 vues). Les 3 autres conditions sont validées par le staff.
      reward: { name: 'Ta place dans l’accompagnement', description: 'L’accès GRATUIT à l’accompagnement de Mickaël Wu, l’un des meilleurs accompagnements de France dans la création de contenu.', price: 100_000, ref: 'accompagnement', url: '#', linkLabel: 'Découvrir l’accompagnement' },
      texts: texts('Mickaël Wu', 'ta place dans son accompagnement', {
        heroTitle: 'Gagne ta **place**',
        heroText: 'Clippe Mickaël Wu sur TikTok, Instagram et YouTube. Tes vues te rapprochent de l’accès GRATUIT à son accompagnement.',
        heroCta: 'Voir ma progression',
        shopText: 'Ici, les vues ne sont pas payées en argent : la récompense finale, c’est ton intégration GRATUITE à l’accompagnement de Mickaël Wu.',
        finalTitle: 'À toi d’aller **chercher** ta place.',
        faq: [
          { q: 'Les vues sont payées en argent ?', a: 'Non. La récompense finale, c’est l’accès GRATUIT à l’accompagnement de Mickaël Wu. Remplir une condition ne veut pas dire être payé : c’est ton intégration à l’accompagnement.' },
          { q: 'Comment j’obtiens ma place ?', a: 'Il suffit de remplir UNE des 4 conditions : 10 millions de vues cumulées, top 3 sur 3 mois, top 10 sur 8 mois, ou 2 vidéos par jour pendant 90 jours (3 jours manqués maximum).' },
          { q: 'Il y a quand même de l’argent à gagner ?', a: 'Oui : +100 € pour le clipper le plus actif du mois (annoncé dans #résultats-clippers). Et tu gardes bien sûr tout ce que tes propres comptes te rapportent avec la TikTok Money.' },
          { q: 'Quelles vidéos comptent ?', a: 'Le format vertical, cumulé sur TikTok, Instagram et YouTube.' },
          { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et connecte tes comptes TikTok, Instagram et YouTube.' },
        ],
      }),
      ms: {
        skin: 'micka',
        rewardShort: 'l’accompagnement',
        goal: 'ta place dans l’accompagnement',
        joinText: '10 M de vues = ta place !',
        tierEmoji: true,
        reel: ['ms-micka-v0.webp', 'ms-micka-v1.webp', 'ms-micka-v2.webp', 'ms-micka-v3.webp', 'ms-micka-v4.webp', 'ms-micka-v5.webp'],
        heroLine: 'L’accès gratuit à l’accompagnement de Mickaël Wu',
        punch: 'À la performance.',
        kicker: 'Important',
        statLeft: { badge: '🎓', text: 'L’accompagnement de Mickaël Wu offert' },
        statRight: { big: '10 M', text: 'vues = ta place' },
        ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
        offer: { title: '+100 € pour le clipper le plus actif du mois', text: 'Annoncé dans #résultats-clippers, avec les résultats partagés et des conseils.', side: 'Chaque mois' },
        timelineTitle: 'Comment gagner ta place',
        timeline: [
          { emoji: '📈', title: '10 millions de vues', text: 'Génère 10 millions de vues en format vertical, cumulées sur TikTok, Instagram et YouTube.' },
          { emoji: '🥇', title: 'Top 3 sur 3 mois', text: 'Fais partie des 3 clippers qui ont généré le plus de vues sur une période de 3 mois.' },
          { emoji: '🏆', title: 'Top 10 sur 8 mois', text: 'Fais partie des 10 clippers qui ont généré le plus de vues sur une période de 8 mois.' },
          { emoji: '📅', title: '2 vidéos par jour', text: 'Poste 2 vidéos par jour pendant 90 jours, avec 3 jours manqués maximum.' },
        ],
        tiersTitle: 'Une seule condition suffit. Jusqu’où tu montes ?',
        band: 'GAGNE TA PLACE ✦ L’ACCOMPAGNEMENT DE MICKAËL WU ✦ +100 € POUR LE PLUS ACTIF DU MOIS',
        alone: { title: 'Seul', text: 'Des clips postés pour rien : pas de plan, pas de retour, personne pour te faire progresser…' },
        withUs: { title: 'Avec Mickaël Wu', lines: ['Ta place dans l’accompagnement', '+100 € pour le plus actif du mois', 'Tu gardes ta TikTok Money', 'Une commu qui te pousse'] },
        faqAside: 'Ici, on récompense la performance par une opportunité qui vaut bien plus sur le long terme. 🏆',
      },
    },
  },

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
      // Seule récompense : JosplayMax (nom provisoire), toutes les rediffusions de ses lives, 1 mois = 5 000 coins
      reward: { name: '1 mois de JosplayMax', description: 'Toutes les rediffusions des lives de Josplay, rangées comme sur une plateforme de streaming. Les mois s’additionnent.', price: 5_000, ref: 'josplaymax-1m', url: '#/max', linkLabel: 'Voir JosplayMax' },
      texts: texts('Josplay', 'JosplayMax', {
        shopText: 'Échange tes coins contre des mois de JosplayMax : toutes les rediffusions des lives de Josplay.',
        heroTitle: 'Clippe Josplay. **Fais de l’argent.**',
        heroCta: 'Voir ma progression',
        faq: [
          { q: 'Comment je gagne de l’argent avec TikTok ?', a: 'Avec le programme de récompenses des créateurs de TikTok : tes clips d’1 minute et plus sont payés aux vues. Il faut avoir 18 ans, 10 000 abonnés et 100 000 vues sur les 30 derniers jours. Plus tes clips font de vues, plus tu gagnes.' },
          { q: 'Et les coins, c’est en plus ?', a: 'Oui : 1 000 vues = 10 coins, tous comptes confondus. 5 000 coins = 1 mois de JosplayMax, et ça se cumule.' },
          { q: 'C’est quoi JosplayMax ?', a: 'L’espace réservé aux clippeurs : toutes les rediffusions des lives de Josplay, triées (plus récentes, à reprendre, plus vues). Il apparaît dans ton menu dès que tu as échangé ton mois.' },
          { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » et connecte tes comptes TikTok, Instagram et YouTube.' },
          { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum pour les coins. Un compte qui démarre peut en gagner dès son premier clip.' },
        ],
      }),
      // JosplayMax : rediffusions de lives (exemples pour la maquette ; ensuite ajoutées à la main ou via son Twitch)
      vault: {
        name: 'JosplayMax',
        route: 'max',
        tagline: 'Tous les lives de Josplay en replay. Réservé aux clippeurs.',
        rows: [
          { title: 'Plus récentes', items: [
            { title: 'Elden Ring : 651 morts', date: 'Live du 8 oct.', duration: '4:12:06', image: 'ms-hero-josplay.webp' },
            { title: 'Mario Kart avec la commu', date: 'Live du 6 oct.', duration: '3:05:41', hue: 205 },
            { title: 'Nuit horreur', date: 'Live du 4 oct.', duration: '5:20:13', hue: 280 },
            { title: 'Réaction à vos clips', date: 'Live du 2 oct.', duration: '2:48:30', hue: 20 },
          ] },
          { title: 'Reprendre', progress: true, items: [
            { title: 'Speedrun Zelda', date: 'Live du 29 sept.', duration: '3:58:02', hue: 140, progress: 62 },
            { title: 'Smash avec les abonnés', date: 'Live du 27 sept.', duration: '4:01:19', hue: 350, progress: 28 },
            { title: 'Draw my life', date: 'Live du 25 sept.', duration: '1:52:44', hue: 45, progress: 85 },
            { title: 'Minecraft hardcore', date: 'Live du 22 sept.', duration: '6:10:55', hue: 100, progress: 12 },
          ] },
          { title: 'Les plus vues', items: [
            { title: 'Le rage quit légendaire', date: 'Live du 12 sept.', duration: '3:33:33', hue: 0 },
            { title: '24 h de stream', date: 'Live du 1er sept.', duration: '24:00:00', hue: 190 },
            { title: 'Mii party avec vous', date: 'Live du 20 août', duration: '2:40:18', hue: 220 },
            { title: 'Pokémon nuzlocke', date: 'Live du 14 août', duration: '5:02:27', hue: 60 },
          ] },
        ],
      },
      // Accueil riche (mise en page Loann / Cubi) dans la DA de Josplay
      ms: {
        rewardShort: 'JosplayMax',
        tierEmoji: true,
        heroLine: 'avec la monétisation TikTok. Et en plus, tes vues te débloquent JosplayMax : tous ses lives en replay 🔥',
        heroImage: 'ms-hero-josplay.webp',
        statLeft: { badge: '💸', text: 'Tes clips sont monétisables sur TikTok' },
        statRight: { big: '500 k', text: 'vues = 1 mois de JosplayMax' },
        ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
        offer: { title: 'Double gain : TikTok + JosplayMax', text: 'TikTok te paie tes vues, Josplay t’ouvre JosplayMax : tous ses lives en replay.', side: 'Tes vues te paient' },
        timelineTitle: 'Clipper Josplay c’est',
        timeline: [
          { emoji: '✂️', title: 'Des clips qui cartonnent', text: 'Josplay sort des vidéos ultra regardées : tu prends le meilleur passage, tu le montes, ça part.' },
          { emoji: '💸', title: 'De l’argent', text: 'Tes clips d’1 min et plus sont monétisables sur TikTok : plus tu fais de vues, plus tu gagnes.' },
          { emoji: '🎬', title: 'JosplayMax', text: 'Tous les lives de Josplay en replay, rangés comme sur Netflix. 5 000 coins = 1 mois, ça se cumule.' },
          { emoji: '🏆', title: 'La gloire', text: 'Chaque semaine, le top 3 des clippeurs est mis en avant sur le Discord, devant toute la commu.' },
        ],
        tiersTitle: 'Et toi, jusqu’où tu montes ?',
        band: 'CLIPPE JOSPLAY ✦ FAIS DE L’ARGENT AVEC TIKTOK ✦ DÉBLOQUE JOSPLAYMAX',
        alone: { title: 'Seul', text: 'Des clips postés pour rien : pas d’argent, pas de récompense, personne pour t’aider…' },
        withUs: { title: 'Avec Josplay', lines: ['Tes vues te paient', 'Tous ses lives sur JosplayMax', 'Le top 3 mis en avant', 'Une commu qui te pousse'] },
        faqAside: 'Tu as encore des questions ? Pose-les sur le Discord !',
      },
    },
  },
};
