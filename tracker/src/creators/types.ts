/**
 * Configuration d'un créateur (un programme fans = un créateur = un déploiement).
 * Tout ce qui est propre à la marque vit ici : nom, couleurs, textes, récompense, taux.
 * Choisi au démarrage par la variable CREATOR (ex. CREATOR=squiduu). Envoyé tel quel au site.
 */
/** Avis Trustpilot recopié tel quel (style « ms »). */
export interface MsReview { name: string; meta: string; title?: string; text?: string; avatar?: string; initials?: string; bg?: string; fg?: string }

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
  /** playful = BeOne (clair, jaune) · sober = sombre et épuré · pop = sombre, multicolore et animé. */
  theme: 'playful' | 'sober' | 'pop';
  /** Variante visuelle du thème pop : « sticker » = contours noirs épais et ombres dures (style meme / autocollant). */
  /** « ms » = charte Merguez Superstar (crème étoilé, contours noirs, jaune, vagues entre les sections). */
  style?: 'sticker' | 'ms';
  /** Visuels livrés avec le code (src/web/app/fan/) : bannière du hero et image de la récompense. */
  images?: { banner?: string; reward?: string };
  /** accent2 / accent3 : couleurs des dégradés du thème « pop ». highlight : couleur de mise en avant (violet par défaut). */
  colors: { bg: string; card: string; border: string; text: string; muted: string; accent: string; accentInk: string; accent2?: string; accent3?: string; highlight?: string };
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
  /** Autres récompenses créées dans la boutique (ex. Noah : Speedrun Monétisation à 5 M de vues). */
  extraRewards?: Array<{ name: string; description: string; price: number; ref: string; url: string; linkLabel: string }>;
  levels: Array<{ name: string; emoji: string; min: number }>;
  /**
   * Grades Discord selon les vues des N derniers jours (ex. 30) : un rôle par niveau (Débutant, Confirmé, Pro, Élite),
   * qui monte ou redescend chaque jour selon le mois glissant. Sans ce champ : pas de rôles de grade.
   */
  gradeWindowDays?: number;
  /**
   * Classement du mois : les N premiers (vues gagnées sur le mois calendaire) reçoivent la récompense principale
   * gratuitement, le 1er du mois suivant (annonce dans #classement, livraison comme un achat). Ex. 3.
   */
  monthlyPrize?: number;
  /**
   * Lot du podium du mois quand ce n'est pas la récompense de la boutique (ex. « une place à l'événement IRL du mois »).
   * Rien n'est créé dans la boutique : le podium est annoncé et le staff contacte les gagnants.
   */
  monthlyPrizeLabel?: string;
  /** Version courte du lot du mois pour la pastille du podium (ex. « Place à l’event IRL »). */
  monthlyPrizeShort?: string;
  /** true = clippeurs de confiance : aucun compte « à vérifier » ni fan suspect, tout est validé d'office. */
  trustAccounts?: true;
  /** false = pas de mot-clé (#tag) obligatoire dans la légende : tous les clips des comptes reliés comptent. */
  clipRule?: false;
  /**
   * Date (AAAA-MM-JJ, heure de Paris) à partir de laquelle TOUS les clips des comptes reliés comptent, avec toutes leurs vues,
   * même s'ils ont été postés avant l'inscription. Sans ce champ : seuls les clips postés après l'inscription comptent.
   */
  countViewsFrom?: string;
  /** Mots acceptés dans la légende d'un clip pour qu'il compte (en plus du nom et des chaînes YouTube). */
  clipKeywords?: string[];
  /** Libellés des statuts dans « Mes échanges ». */
  statuses: { pending: string; delivered: string; refunded: string };
  texts: {
    /** Les passages entre **…** sont mis en couleur d'accent (gabarit « sober »). */
    heroTitle: string;
    heroText: string;
    heroCta: string;
    /** Style « sticker » : bandeau défilant sous la bannière (mots répétés en boucle). */
    ticker?: string[];
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
  /**
   * Messages du serveur Discord monté par /setup. {creator} = mention du rôle 👑 Créateur,
   * {rate} = coins pour 1 000 vues. Sans cette section, des textes génériques sont utilisés.
   */
  discord?: { welcome: string; rules: string };
  /** Style « ms » : accueil sur le modèle de ms-creators.com. Visuels ms-*.webp dans src/web/app/fan/. */
  /**
   * Espace vidéo réservé (ex. « JosplayMax ») : rediffusions de lives en rangées façon plateforme de streaming.
   * Visible dans le menu et accessible seulement pour les fans qui ont un accès en cours (récompense échangée).
   */
  vault?: {
    name: string;
    route: string;
    tagline: string;
    rows: Array<{ title: string; progress?: boolean; items: Array<{ title: string; date: string; duration: string; image?: string; hue?: number; progress?: number; url?: string }> }>;
  };
  ms?: {
    /** Nom court de la récompense dans les phrases (« ton mois de … »), ex. « MS », « Roblox Academy ». */
    rewardShort?: string;
    /** Paliers affichés avec l'emoji du niveau (au lieu des étoiles ms-tier*.webp). */
    tierEmoji?: boolean;
    /** Section « Ta série 🔥 » (flammes de série, DA de xegini) avec la démo « Poster un clip ». */
    streak?: boolean;
    /** Paliers dessinés en cubes (couleurs du dessus / gauche / droite), à la place des étoiles ms-tier*.webp. */
    tierCubes?: Array<{ top: string; left: string; right: string }>;
    /** Variante de charte sur la même mise en page (classe CSS sur <body>), ex. « cubi » = noir, blanc et orange. */
    skin?: 'cubi' | 'micka' | 'noah';
    /** Carrousel de vidéos verticales (fichiers ms-*.webp) à la place du cadre du hero : le hero devient titre + carrousel + heroLine en petites capitales + punch, et un CTA final sur fond flouté s'ajoute. */
    reel?: string[];
    /** Vidéos du carrousel (URL .mp4, même ordre que reel) : lues en boucle, l'image de reel sert d'affiche si la vidéo ne charge pas. */
    reelVideos?: string[];
    /** Vidéo de fond du CTA final (URL .mp4). */
    finalVideo?: string;
    /** Témoignages vidéo (format vertical, alternés gauche / droite) : nom, domaine, stats, lien vers le post. */
    showcaseTitle?: string;
    showcase?: Array<{ name: string; niche: string; stats: string[]; video?: string; poster?: string; url?: string }>;
    /** Grosse phrase sous le carrousel (ex. « Au plus vite. »). */
    punch?: string;
    /** Objectif en toutes lettres quand la récompense n'est pas « un mois » (ex. « ta place dans l’accompagnement »). */
    goal?: string;
    /** Texte de la carte au bout de la frise (défaut « 1 M vues = 1 mois ! »). */
    joinText?: string;
    /** Visuel (fichier ms-*.webp) à la place de la carte au bout de la frise. */
    joinImage?: string;
    /** Petit sur-titre au-dessus de la frise (ex. « À toi de jouer »). */
    kicker?: string;
    /** Sous-titre du hero (sous heroTitle). */
    heroLine: string;
    /** Image du cadre central du hero (fichier ms-*.webp), sinon la photo du créateur. */
    heroImage?: string;
    /** Carte-stat de gauche (badge rond + texte) et de droite (gros chiffre + texte). */
    /** Carte de gauche du hero ; avec `big`, affichée comme la carte de droite (gros chiffre). */
    statLeft: { badge: string; text: string; big?: string };
    statRight: { big: string; text: string };
    /** Petite ligne sous le bouton du hero. */
    ctaNote: string;
    /** Bandeau sous le hero (façon « Seule l'offre à vie est disponible »). */
    /** Bandeau sous le bouton du hero (facultatif). */
    offer?: { title: string; text: string; side: string };
    /** Frise verticale « Le programme c'est… » : titre de section puis étapes. */
    timelineTitle: string;
    timeline: Array<{ title: string; text: string; emoji: string }>;
    /** Avis Trustpilot qui défilent (2 rangées en sens opposés), lien vers la page Trustpilot. avatar = ms-av-*.webp, sinon initiales. */
    reviews?: { url: string; score: string; top: MsReview[]; bottom: MsReview[] };
    /** Conférenciers : fichiers ms-speakerNN.webp. */
    speakersTitle?: string;
    speakers?: string[];
    /** Paliers (niveaux du créateur) : fichiers ms-tier1..4.webp. */
    tiersTitle: string;
    /** Bandeau défilant jaune avec le logo (image de la récompense). */
    band: string;
    /** « Seul » vs « Avec … ». */
    alone: { title: string; text: string };
    withUs: { title: string; lines: string[] };
    /** Carte à côté de la FAQ. */
    faqAside: string;
  };
}
