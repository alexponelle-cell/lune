import type { CreatorConfig } from './types.js';

/**
 * Noah Panchaud (@Noah_Panchaud + @Noah_Pasness) : accueil riche (body.rich) à la DA de son site
 * (speendrunmonetisation90jours.netlify.app) : blanc, noir, rouge #E10600, surligné jaune, étapes rouge → ambre → lime → vert.
 * Call du 16 oct (Lucas) : clips de son contenu DIVERTISSEMENT sur les comptes des clippeurs.
 *  - 500 k vues (5 000 coins) = 1 mois de Créateur Club (son produit low ticket, livré via Bonzai)
 *  - 5 M de vues (50 000 coins) = accès aux coachings de Speedrun Monétisation (mid ticket, pas les modules),
 *    réservé aux clippeurs Pro (> 100 k vues / mois) inscrits depuis au moins 1 mois : vérifié par le staff à la validation de l'achat.
 */
const VSL = '7JFrw9QxM9I';
const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const noah: CreatorConfig = {
  id: 'noah',
  programName: 'NOAH PANCHAUD CLIPPING',
  creatorName: 'Noah Panchaud',
  clipKeywords: ['noah', 'noahpanchaud', 'noah panchaud', 'speedrun monétisation'],
  youtube: 'Noah_Panchaud,Noah_Pasness',
  theme: 'sober',
  colors: { bg: '#FFFFFF', card: '#FFFFFF', border: '#E4E4E7', text: '#0D0D0F', muted: '#5A5A63', accent: '#E10600', accentInk: '#FFFFFF', highlight: '#E10600' },
  font: 'Inter',
  logoText: 'noah',
  pointsPer1000: 10,
  rewardAccount: {
    kind: 'email',
    title: 'Ton accès',
    label: 'E-mail pour ton accès (Créateur Club)',
    placeholder: 'ton@email.com',
    badge: 'Accès relié',
    deliveryHint: 'Ton accès est envoyé sur cet e-mail.',
  },
  reward: {
    name: '1 mois de Créateur Club',
    description: 'Le Créateur Club de Noah Panchaud : analyses de chaînes, conseils et une commu de créateurs pour percer sur YouTube. Les mois s’additionnent.',
    price: 5_000,
    ref: 'createur-club-1m',
    url: 'https://bonzai.pro/noah-panchaud',
    linkLabel: 'Découvrir le Créateur Club',
  },
  extraRewards: [
    {
      name: 'Coachings Speedrun Monétisation',
      description: 'L’accès aux coachings de Speedrun Monétisation 90 jours, l’accompagnement de Noah. Réservé aux clippeurs Pro (+100 k vues par mois) inscrits depuis au moins 1 mois.',
      price: 50_000,
      ref: 'speedrun-coachings',
      url: 'https://speendrunmonetisation90jours.netlify.app/',
      linkLabel: 'Découvrir Speedrun Monétisation',
    },
  ],
  gradeWindowDays: 30,
  levels: [
    { name: 'Débutant', emoji: '🌱', min: 0 },
    { name: 'Confirmé', emoji: '⚡', min: 10_000 },
    { name: 'Pro', emoji: '🔥', min: 100_000 },
    { name: 'Élite', emoji: '💎', min: 1_000_000 },
  ],
  ms: {
    skin: 'noah',
    rewardShort: 'Créateur Club',
    joinText: '500 k vues = 1 mois !',
    tierEmoji: true,
    heroImage: `https://i.ytimg.com/vi/${VSL}/maxresdefault.jpg`,
    heroLine: 'Clippe ses vidéos sur TikTok, Instagram et YouTube. Tes vues te paient le Créateur Club, et même ses coachings.',
    statLeft: { badge: '🎓', text: 'Le Créateur Club de Noah offert' },
    statRight: { big: '500 k', text: 'vues = 1 mois de Créateur Club' },
    ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
    offer: { title: '5 M de vues = les coachings de Speedrun Monétisation', text: 'Pour les clippeurs Pro (+100 k vues par mois) inscrits depuis au moins 1 mois.', side: 'Le niveau au-dessus' },
    timelineTitle: 'Comment ça se passe, étape par étape',
    timeline: [
      { emoji: '✂️', title: 'Tu clippes', text: 'Tu prends le passage le plus drôle ou le plus fort d’une vidéo de Noah et tu le montes à ta façon.' },
      { emoji: '📱', title: 'Tu postes', text: 'Sur TikTok, Instagram ou YouTube Shorts. Toutes tes vues sont additionnées.' },
      { emoji: '🪙', title: 'Tu gagnes des coins', text: '10 coins pour 1 000 vues, comptés chaque nuit, automatiquement.' },
      { emoji: '🎓', title: 'Tu gagnes le Créateur Club', text: '500 000 vues = 1 mois de Créateur Club offert. Et à 5 millions, les coachings de Speedrun Monétisation.' },
    ],
    showcaseTitle: 'Ils l’ont déjà fait',
    showcase: [
      { name: 'Litsu', niche: '618 000 abonnés', stats: ['Son avis juste après son premier appel'], poster: yt('dM48-pkuam8'), url: 'https://youtu.be/dM48-pkuam8' },
      { name: 'Simon Gaming', niche: '200 000 abonnés', stats: ['Ce qu’il retient de son premier appel'], poster: yt('QLbQ_R8tUg8'), url: 'https://youtu.be/QLbQ_R8tUg8' },
      { name: 'Nihnja08', niche: '50 000 abonnés', stats: ['Son retour après avoir percé sur YouTube'], poster: yt('3C0Qg9NKPrY'), url: 'https://youtu.be/3C0Qg9NKPrY' },
      { name: 'Mark', niche: '13 000 abonnés', stats: ['Son bilan après 90 jours complets'], poster: yt('yLLiwZnBxLI'), url: 'https://youtu.be/yLLiwZnBxLI' },
    ],
    tiersTitle: 'Et toi, jusqu’où tu montes ?',
    band: '500 K VUES = 1 MOIS DE CRÉATEUR CLUB ✦ 5 M = LES COACHINGS SPEEDRUN MONÉTISATION',
    alone: { title: 'Seul', text: 'Des clips postés au hasard : pas de méthode, pas de retour, pas de récompense…' },
    withUs: { title: 'Avec Noah', lines: ['Le Créateur Club offert', 'Ses coachings pour les meilleurs', 'Tu gardes ta TikTok Money', 'Une commu qui te pousse'] },
    faqAside: 'Tu as encore des questions ? Pose-les sur le Discord !',
  },
  statuses: { pending: 'En attente', delivered: 'Livré ✅', refunded: 'Remboursé' },
  texts: {
    heroTitle: 'Clippe Noah. **Gagne le Créateur Club**',
    heroText: 'Poste des clips de Noah Panchaud sur TikTok, Instagram ou YouTube. Tes vues te rapportent des coins, que tu échanges contre des mois de Créateur Club.',
    heroCta: 'Voir ma progression',
    steps: [
      { title: 'Crée ton clip', text: 'Un passage de Noah qui mérite d’être vu.' },
      { title: 'Poste-le', text: 'Sur TikTok, Instagram ou YouTube.' },
      { title: 'Gagne des coins', text: '10 coins pour 1 000 vues, tous comptes confondus.' },
      { title: 'Prends ton mois', text: '5 000 coins = 1 mois de Créateur Club.' },
    ],
    shopTitle: 'Récompenses',
    shopText: 'Ici, tes vues ne sont pas payées en argent : tu les échanges contre des mois de Créateur Club, et à 5 M de vues contre les coachings de Speedrun Monétisation.',
    clipTitle: 'Clipper',
    clipText: 'Poste des clips de Noah Panchaud sur TikTok, Instagram ou YouTube. Tes vues sont comptées chaque nuit.',
    rankingText: 'Les clippeurs qui ont fait le plus de vues ces 7 derniers jours.',
    footer: 'Noah Panchaud Clipping',
    deliveredDm: '✅ **{item}** : ton accès a été envoyé sur ton e-mail !',
    dmFooter: 'Noah Panchaud Clipping · Clippe, gagne le Créateur Club',
    faq: [
      { q: 'Les vues sont payées en argent ?', a: 'Non. Tu échanges tes vues contre des mois de Créateur Club. Et tu gardes tout ce que tes comptes te rapportent avec la TikTok Money.' },
      { q: 'Combien de vues pour 1 mois de Créateur Club ?', a: '500 000 vues cumulées sur TikTok, Instagram et YouTube Shorts = 5 000 coins = 1 mois. Les mois s’additionnent.' },
      { q: 'Et les coachings de Speedrun Monétisation ?', a: '5 millions de vues (50 000 coins). Réservé aux clippeurs Pro (+100 k vues par mois) inscrits depuis au moins 1 mois : le staff vérifie avant de valider.' },
      { q: 'Quelles vidéos je clippe ?', a: 'Les vidéos divertissement de Noah sur ses chaînes YouTube. Tu postes sur TES comptes, et tu mets #noah dans la légende.' },
      { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » : tu arrives sur le site, tu connectes ton TikTok et tu ajoutes tes @ YouTube et Instagram.' },
      { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum. Un compte qui démarre peut gagner des coins dès son premier clip.' },
    ],
    finalTitle: 'Prêt à **commencer au jour 0** ?',
    finalText: 'Connecte-toi avec Discord, relie tes comptes et commence à gagner des coins dès ton prochain clip.',
  },
};
