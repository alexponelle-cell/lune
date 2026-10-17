import type { CreatorConfig } from './types.js';

/**
 * Noah Panchaud (Speedrun Monétisation 90 jours) : accueil riche (body.rich) à la DA de son site
 * (speendrunmonetisation90jours.netlify.app) : blanc, noir, rouge #E10600, surligné jaune, étapes rouge → ambre → lime → vert.
 * ⚠️ Récompense PROVISOIRE (à confirmer avec le call) : sa place dans Speedrun Monétisation 90 jours.
 */
const VSL = '7JFrw9QxM9I';
const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const noah: CreatorConfig = {
  id: 'noah',
  programName: 'NOAH PANCHAUD CLIPPING',
  creatorName: 'Noah Panchaud',
  clipKeywords: ['noah', 'noahpanchaud', 'noah panchaud', 'speedrun monétisation'],
  // TODO : @ de ses 2 chaînes YouTube (photo du site + alertes vidéos)
  youtube: '',
  theme: 'sober',
  colors: { bg: '#FFFFFF', card: '#FFFFFF', border: '#E4E4E7', text: '#0D0D0F', muted: '#5A5A63', accent: '#E10600', accentInk: '#FFFFFF', highlight: '#E10600' },
  font: 'Inter',
  logoText: 'noah',
  pointsPer1000: 10,
  rewardAccount: {
    kind: 'email',
    title: 'Ton accès',
    label: 'E-mail pour ton accès à Speedrun Monétisation',
    placeholder: 'ton@email.com',
    badge: 'Accès relié',
    deliveryHint: 'Ton accès à Speedrun Monétisation 90 jours est envoyé sur cet e-mail.',
  },
  reward: {
    name: 'Ta place dans Speedrun Monétisation',
    description: 'L’accompagnement de Noah Panchaud pour monétiser ta chaîne YouTube en 90 jours : conférences, retours détaillés sur ton travail, et la méthode pour exploser.',
    price: 10_000,
    ref: 'speedrun-90j',
    url: 'https://speendrunmonetisation90jours.netlify.app/',
    linkLabel: 'Découvrir Speedrun Monétisation',
  },
  gradeWindowDays: 30,
  levels: [
    { name: 'Débutant', emoji: '🌱', min: 0 },
    { name: 'Confirmé', emoji: '⚡', min: 10_000 },
    { name: 'Pro', emoji: '🔥', min: 100_000 },
    { name: 'Élite', emoji: '💎', min: 1_000_000 },
  ],
  ms: {
    skin: 'noah',
    rewardShort: 'Speedrun Monétisation',
    goal: 'ta place dans Speedrun Monétisation',
    joinText: '1 M de vues = ta place !',
    tierEmoji: true,
    heroImage: `https://i.ytimg.com/vi/${VSL}/maxresdefault.jpg`,
    heroLine: 'Clippe ses vidéos sur TikTok, Instagram et YouTube. Tes vues te rapprochent d’une place GRATUITE dans son accompagnement.',
    statLeft: { badge: '🎓', text: 'L’accompagnement de Noah offert' },
    statRight: { big: '1 M', text: 'vues = ta place' },
    ctaNote: 'Connecte-toi avec Discord pour voir où tu en es',
    offer: { title: 'Tes vues te paient l’accompagnement', text: 'Pas besoin de payer : tes clips te font gagner ta place dans Speedrun Monétisation 90 jours.', side: '100 % gratuit' },
    timelineTitle: 'Comment ça se passe, étape par étape',
    timeline: [
      { emoji: '✂️', title: 'Tu clippes', text: 'Tu prends le meilleur passage d’une vidéo de Noah et tu le montes à ta façon.' },
      { emoji: '📱', title: 'Tu postes', text: 'Sur TikTok, Instagram ou YouTube Shorts. Toutes tes vues sont additionnées.' },
      { emoji: '🪙', title: 'Tu gagnes des coins', text: '10 coins pour 1 000 vues, comptés chaque nuit, automatiquement.' },
      { emoji: '🎓', title: 'Tu gagnes ta place', text: '1 million de vues = ta place GRATUITE dans Speedrun Monétisation 90 jours.' },
    ],
    showcaseTitle: 'Ils l’ont déjà fait',
    showcase: [
      { name: 'Litsu', niche: '618 000 abonnés', stats: ['Son avis juste après son premier appel'], poster: yt('dM48-pkuam8'), url: 'https://youtu.be/dM48-pkuam8' },
      { name: 'Simon Gaming', niche: '200 000 abonnés', stats: ['Ce qu’il retient de son premier appel'], poster: yt('QLbQ_R8tUg8'), url: 'https://youtu.be/QLbQ_R8tUg8' },
      { name: 'Nihnja08', niche: '50 000 abonnés', stats: ['Son retour après avoir percé sur YouTube'], poster: yt('3C0Qg9NKPrY'), url: 'https://youtu.be/3C0Qg9NKPrY' },
      { name: 'Mark', niche: '13 000 abonnés', stats: ['Son bilan après 90 jours complets'], poster: yt('yLLiwZnBxLI'), url: 'https://youtu.be/yLLiwZnBxLI' },
    ],
    tiersTitle: 'Et toi, jusqu’où tu montes ?',
    band: 'CLIPPE NOAH ✦ GAGNE TA PLACE DANS SPEEDRUN MONÉTISATION 90 JOURS',
    alone: { title: 'Seul', text: 'Des clips postés au hasard : pas de méthode, pas de retour, pas de récompense…' },
    withUs: { title: 'Avec Noah', lines: ['Ta place dans l’accompagnement', 'Tu gardes ta TikTok Money', 'Un classement chaque semaine', 'Une commu qui te pousse'] },
    faqAside: 'Tu as encore des questions ? Pose-les sur le Discord !',
  },
  statuses: { pending: 'En attente', delivered: 'Livré ✅', refunded: 'Remboursé' },
  texts: {
    heroTitle: 'Clippe Noah. Gagne ta place en **90 jours**',
    heroText: 'Poste des clips de Noah Panchaud sur TikTok, Instagram ou YouTube. Tes vues te font gagner ta place dans Speedrun Monétisation 90 jours.',
    heroCta: 'Voir ma progression',
    steps: [
      { title: 'Crée ton clip', text: 'Un passage de Noah qui mérite d’être vu.' },
      { title: 'Poste-le', text: 'Sur TikTok, Instagram ou YouTube.' },
      { title: 'Gagne des coins', text: '10 coins pour 1 000 vues, tous comptes confondus.' },
      { title: 'Gagne ta place', text: '1 M de vues = ta place dans Speedrun Monétisation.' },
    ],
    shopTitle: 'Récompenses',
    shopText: 'Ici, tes vues ne sont pas payées en argent : la récompense, c’est ta place GRATUITE dans Speedrun Monétisation 90 jours.',
    clipTitle: 'Clipper',
    clipText: 'Poste des clips de Noah Panchaud sur TikTok, Instagram ou YouTube. Tes vues sont comptées chaque nuit.',
    rankingText: 'Les clippeurs qui ont fait le plus de vues ces 7 derniers jours.',
    footer: 'Noah Panchaud Clipping',
    deliveredDm: '✅ **{item}** : ton accès a été envoyé sur ton e-mail !',
    dmFooter: 'Noah Panchaud Clipping · Clippe, gagne ta place',
    faq: [
      { q: 'Les vues sont payées en argent ?', a: 'Non. La récompense, c’est ta place GRATUITE dans Speedrun Monétisation 90 jours, l’accompagnement de Noah. Et tu gardes tout ce que tes comptes te rapportent avec la TikTok Money.' },
      { q: 'Comment j’obtiens ma place ?', a: 'Atteins 1 million de vues cumulées sur TikTok, Instagram et YouTube Shorts (10 coins pour 1 000 vues : 10 000 coins = ta place).' },
      { q: 'Comment je relie mes comptes ?', a: 'Sur le Discord, clique sur « S’inscrire » : tu arrives sur le site, tu connectes ton TikTok et tu ajoutes tes @ YouTube et Instagram.' },
      { q: 'Quand mes vues sont-elles comptées ?', a: 'Chaque nuit. Seuls les clips publiés après ton inscription comptent.' },
      { q: 'Il faut combien d’abonnés ?', a: 'Aucun minimum. Un compte qui démarre peut gagner des coins dès son premier clip.' },
    ],
    finalTitle: 'Prêt à **commencer au jour 0** ?',
    finalText: 'Connecte-toi avec Discord, relie tes comptes et commence à gagner des coins dès ton prochain clip.',
  },
};
