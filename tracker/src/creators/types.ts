/**
 * Configuration d'un créateur (un programme fans = un créateur = un déploiement).
 * Tout ce qui est propre à la marque vit ici : nom, couleurs, textes, récompense, taux.
 * Choisi au démarrage par la variable CREATOR (ex. CREATOR=squiduu). Envoyé tel quel au site.
 */
export interface CreatorConfig {
  id: string;
  /** Nom du programme (logo, onglet, bot). */
  programName: string;
  /** Nom du créateur tel qu'affiché dans les textes. */
  creatorName: string;
  /** Chaîne YouTube (@pseudo, sans @) : sa photo HD sert de logo et de visuel. */
  youtube: string;
  /** Pseudo Roblox du créateur (thème « playful » uniquement). */
  robloxUsername?: string;
  /** Gabarit du site fans : « playful » (BeOne, coloré) ou « sober » (sobre, sombre). */
  theme: 'playful' | 'sober';
  colors: { bg: string; card: string; border: string; text: string; muted: string; accent: string; accentInk: string };
  /** Police Google Fonts du site (gabarit « sober »). */
  font?: string;
  /** Texte du logo (à côté de la photo), ex. « squiduu. ». */
  logoText?: string;
  /** Coins gagnés pour 1 000 vues (valeur par défaut, modifiable dans le dashboard). */
  pointsPer1000: number;
  /** Compte sur lequel les récompenses sont livrées. */
  rewardAccount: {
    kind: 'roblox' | 'email';
    /** Titre du bloc dans le profil. */
    title: string;
    /** Libellé du champ (site + formulaire /inscription). */
    label: string;
    placeholder: string;
    /** Nom du badge une fois le compte relié. */
    badge: string;
    /** Rappel affiché à l'échange : où la récompense sera livrée. */
    deliveryHint: string;
  };
  /** Récompense créée automatiquement dans la boutique si elle n'existe pas encore. */
  reward: null | {
    name: string;
    description: string;
    price: number;
    /** Référence interne (unique). */
    ref: string;
    /** Lien vers le service offert (affiché sur la carte). */
    url: string;
    linkLabel: string;
  };
  levels: Array<{ name: string; emoji: string; min: number }>;
  /** Libellés des statuts dans « Mes échanges ». */
  statuses: { pending: string; delivered: string; refunded: string };
  texts: {
    /** Les passages entre **…** sont mis en couleur d'accent (gabarit « sober »). */
    heroTitle: string;
    heroText: string;
    heroCta: string;
    /** 4 étapes de l'accueil (01 à 04). */
    steps: Array<{ title: string; text: string }>;
    shopTitle: string;
    shopText: string;
    clipTitle: string;
    clipText: string;
    rankingText: string;
    footer: string;
    /** Message privé quand une récompense est livrée ({item} = nom). */
    deliveredDm: string;
    /** Pied des messages privés du bot. */
    dmFooter: string;
    /** Questions fréquentes (accueil, gabarit « sober »). */
    faq?: Array<{ q: string; a: string }>;
    /** Dernier bloc de l'accueil. */
    finalTitle?: string;
    finalText?: string;
  };
}
