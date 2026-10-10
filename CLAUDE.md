# Contexte projet : agence de clipping Neptune (repo « lune »)

Ce fichier est chargé automatiquement par chaque session Claude Code sur ce repo. Il résume le projet, la façon
de travailler avec Alex et l'état actuel. Le mettre à jour quand quelque chose d'important change.

**Tout le détail (personnes, business, architecture, variables, historique, à faire) :** @CONTEXTE-COMPLET.md

## Avec qui tu parles

- **Alex** (francophone, non technique, **mineur**) dirige l'agence de clipping **Neptune** avec **Lucas** et un 3ᵉ associé.
- Réponds **en français, très concis, étape par étape** (« + conscis » = trop long). Pas de jargon. Une action à la fois quand il
  doit cliquer quelque part (Railway, TikTok, Meta, Discord…). Il envoie souvent des captures : lis-les attentivement.
- « GO » = fais-le maintenant, sans redemander. « c » / « c bon » = étape faite.
- Alex veut **0 € de coûts** quand c'est possible. Toujours chercher la solution gratuite d'abord.

## Règles absolues

- **Ne jamais demander, afficher, répéter ni committer** un token, une clé API ou un secret. Les secrets vont uniquement dans
  les **Variables Railway**, saisis par Alex lui-même. Dire : « Ne m'envoie aucune valeur ».
- Ne jamais committer `token.txt` ni de `.bat` contenant des secrets.
- Pas de PR sauf demande explicite. Aucun nom de modèle d'IA dans les commits / PR.
- Branche de travail : celle indiquée dans la session (historiquement `claude/project-foundations-r1b3km`).
  **Si deux sessions Claude travaillent en même temps** : chacune `git pull` avant de commencer et avant de pousser,
  et éviter de modifier les mêmes fichiers en parallèle (sinon conflits).
- Avant chaque push : `cd tracker && npx tsc --noEmit && npx vitest run` (tous les tests doivent passer).

## Le business

- Un **créateur** (YouTubeur) = un **programme de clipping** : des fans (« clippeurs ») postent des clips de ses vidéos
  sur TikTok / Instagram / YouTube Shorts, les vues leur rapportent des **coins**, échangés contre une **récompense**
  (abonnement à la formation / commu du créateur, etc.) dans une boutique.
- Pour chaque créateur : **un site fans**, **un serveur Discord** (monté par la commande `/setup` du bot), et ses clippeurs.
- **Créateurs actifs** : BeOne, SQUIDUU, Loann. **DEBO** : ne répond plus, mis de côté. **Prospects** : Cubi Game, Croshoot, Josplay, Nighting.
- **Mars** = dashboard staff (classement, comptes à vérifier, coaching des clippeurs…).
- **Serveur des monteurs** (« Agence PersonalBrand360 ») : 📦 ressources communes en lecture seule, puis par créateur
  📣annonces / 👱ressource / 💬général, + salon privé. Monté par `/setup-montage` (`src/bot/montage.ts`, bouton 🧹 pour nettoyer).

## Technique (dossier `tracker/`)

- Node 22, TypeScript ESM, **discord.js v14**, **better-sqlite3** (migrations dans `src/db/schema.ts`, actuellement **v19**),
  **Hono** (serveur web), **zod**, **vitest**.
- `src/creators/*.ts` : **config de chaque créateur** (nom, couleurs, police, textes, récompense, niveaux, messages Discord).
  Choisie au démarrage par la variable `CREATOR`. Ajouter un créateur = copier `squiduu.ts`, l'adapter, l'ajouter dans `index.ts`.
- Site fans : `src/web/app/fan-sober.html` (gabarits `sober` et `pop`, variante `sticker`), `fan.html` (gabarit `playful` de BeOne).
  Rendu par `soberPage()` dans `src/web/sober.ts`.
- **Maquettes prospects** (pour chauffer le prospect en call) : `src/creators/prospects.ts` + visuels dans `src/web/app/demo/`,
  servies sur `/demo/<slug>` (cubi-game, croshoot, josplay). C'est le **vrai site** à leur charte, avec des données d'exemple et la connexion désactivée.
  Versions autonomes envoyées à Alex : `maquette-*.html` à la racine. Pour un nouveau prospect : Alex envoie un prompt de DA + des captures ;
  ajouter une entrée dans `PROSPECTS`, découper les visuels dans ses captures, générer le HTML autonome, faire une capture Playwright pour vérifier.
- Bot : `src/bot/` (`fanServer.ts` = /setup du serveur créateur, `fans.ts` = inscription, `montage.ts`, `recruitment.ts`…).
- Relevés des vues : `src/jobs/collect.ts` + `src/platforms/` :
  - YouTube : API officielle (gratuite).
  - TikTok / Instagram : **connexion officielle OAuth** (gratuite, prouve que le compte est au clippeur), sinon **Apify** (payant).
  - Fans : relevé chaque nuit après minuit (Paris). Comptes Apify : toutes les 2 nuits, moins souvent si inactifs (économies).
- Anti-triche : un clip compte seulement si le compte est vérifié, si le clip est publié après l'ajout du compte,
  et si sa légende cite le créateur (mot-clé, ex. #squiduu). Les petits comptes (< 10 k abonnés, aucune vidéo ≥ 100 k vues)
  sont validés automatiquement ; les gros vont dans « Comptes à vérifier » sur Mars.
- Coaching des clippeurs (points forts / à travailler) : `src/domain/coaching.ts`.
- **FAQ auto du salon ❓│aide et des salons privés** (gratuite, par mots-clés) : `src/domain/faq.ts` + `attachHelpChannel` (`bot/fans.ts`). Réponses perso : solde, ce qu'il manque pour la récompense, place au classement, « pourquoi ce clip ne compte pas » (lien collé), « pourquoi 0 coins ». Questions non reconnues → table `faq_misses` (v18), carte « Questions sans réponse » dans Mars → Fans : les ajouter à `domain/faq.ts`. **/aide** (et message épinglé dans ❓│aide posté par /setup) : menu déroulant de questions (`FAQ_MENU`), réponse perso visible par le fan seul. Le staff (Gérer les messages) n'est jamais repris. ⚠️ Le bot du créateur doit avoir **MESSAGE CONTENT INTENT** activé (portail Discord → Bot), sinon il démarre sans lire les messages (puis Restart du service Railway). Testé OK sur SQUIDUU.
- Pages légales : `/legal/privacy`, `/legal/terms` (demandées par TikTok / Meta).
- Vérifier visuellement une page : Playwright avec Chromium dans `/opt/pw-browsers/chromium` (`NODE_PATH=$(npm root -g)`).
- Le réseau sortant de l'agent bloque souvent Apify, Railway, croshop.fr, etc. : demander des captures à Alex plutôt que de deviner.

## Déploiement

- **Railway** : un service par créateur (`lune` = BeOne + agence + Mars, puis `squiduu`, `Debo`, `loann`), tous déployés depuis ce repo.
  URL publique de lune : https://lune-production-dbd1.up.railway.app · loann : https://loann-production.up.railway.app/fan · cubi : https://cubi-production.up.railway.app/fan
- Les secrets (token Discord, clés API, TikTok, Instagram, Apify…) sont dans les Variables Railway de chaque service.
- Détails : `tracker/DEPLOY.md`, `tracker/README.md`.

## Où on en est (à mettre à jour)

- **Apify** : plan Starter à 19 $/mois, **plafonné à 19 $** en attendant les validations TikTok / Meta. Objectif : ne plus en dépendre.
- **TikTok officiel** : testé en Sandbox (OK). 1re demande **refusée** (10 oct : nom de l’app pas affiché sur le site + Website URL = page de connexion). Corrigé : vitrine publique « Neptune Clipping » sur l’accueil de lune (`src/web/neptune.ts`, visiteurs non connectés), Website / Privacy / Terms tous sur lune-production-dbd1 ; **renvoyée le 10 oct**. Si refus pour le domaine : acheter un domaine type neptuneclipping.fr. Quand c'est validé :
  remettre les clés Production sur les 4 services, ajouter les Redirect URIs des 3 autres sites, puis `TIKTOK_APIFY_FALLBACK=0`.
- **Instagram officiel (Meta)** : testé (OK, démo filmée). Bloqué par la **vérification d'entreprise** : Alex est mineur,
  Alex a **15 ans** (micro à son nom impossible avant 16 ans) → **un parent crée la micro à son nom** (gratuit, ce week-end si son père est d’accord), titulaire légal et du compte Meta ; SAS à 3 plus tard (la micro de Lucas est peut-être inutilisable). Ensuite : vérif d'entreprise Meta,
  demande de validation avec la démo (il manque l'icône de l'app), puis clés sur Railway et `INSTAGRAM_APIFY_FALLBACK=0`.
  Les clés TikTok et Instagram ont été **retirées de Railway** en attendant.
- **Maquettes prospects** : Cubi Game, Croshoot, Josplay faites. **Nighting** en pause (pas 100 % intéressé).
  Josplay : récompense à définir.
- **Site Loann** (style « ms », copie de ms-creators.com) : pour les clippeurs déjà inscrits, message « 1 M de vues = 1 mois de MS ». Boutons « Voir ma progression » → page `#/progression` (barre vers 1 M, stats, classement). Avis Trustpilot de MS en cartes HTML, conférenciers MS (`ms-*.webp`). Textes dans `loann.ts` (champ `ms`), rendu `pageHomeMs()` dans `fan-sober.html`.
- **Cubi Game** (signé) : vrai site `creators/cubi.ts` (CREATOR=cubi), même mise en page que Loann en skin « cubi » (noir et blanc, police Bungee, bords en blocs, paliers en cubes chocolat / bronze / argent / or, aucune mention de MS). Récompense : 100 k vues (1 000 coins) = 1 mois de Roblox Academy. Service Railway **Cubi** = l'ancien service Debo recyclé (Trial : pas de nouveau service possible), `DATABASE_PATH=./data/cubi.db`, bot de Debo renommé « Cubi Game Clipping », serveur Discord de Debo repris pour Cubi.
- **Liste de Lucas** : IA « clipper » (FAQ gratuite par défaut, il faut ses tutos / conférences / ateliers),
  améliorer le système avec sa data.
- Josplay : trouver comment rémunérer les clippeurs. Loann : bot OK sur le nouveau serveur (/setup + FAQ ❓│aide testés), reste un test d’inscription complet. Loann : **pas de #tag** (`clipRule: false`) et **tous les clips depuis le 1er août 2026 comptent** (`countViewsFrom`, rattrapage unique : TOUS les clips depuis le 1er août, jusqu’à 500 par compte, **seulement sur les comptes gratuits** (YouTube + connectés) : sur Apify il a vidé le plafond de 19 $ le 9 oct ; comptes de confiance `trustAccounts`, pas de vérif staff ni de validation des achats). **Podium du mois** (`monthlyPrize: 3`) : le 1er du mois à 10 h, le top 3 du mois écoulé reçoit 1 mois de MS offert (commande à 0 coin, annonce dans #classement ; `monthLeaderboard` dans `/api/fan/public` pour le site). **Livraison auto MS** : prête (`GRANT_API_URL` / `GRANT_API_TOKEN`, même format que Squiduuverse : POST /grant {email, months, orderId}), il faut que MS fournisse l’API. **/inscription2** : 2ᵉ compte par réseau (colonne `accounts.slot`, v19). Railway : encore en **Trial** (crédit unique de 5 $, ~1 $ consommé en 2 semaines) → passer en Hobby (5 $/mois) avant la fin du crédit, sinon tout s’arrête.

## Ma façon de travailler (à garder)

- Comprendre le besoin réel derrière la demande (ex. « file ingérable » → automatiser le tri, pas juste l'expliquer).
- Livrer quelque chose qui marche et vérifié (typecheck, tests, capture d'écran), puis expliquer en 3-5 lignes.
- Réutiliser l'existant (gabarits du site, configs créateurs) plutôt que repartir de zéro.
- Toujours dire clairement ce qui reste à faire **par Alex** (clics sur Railway / Discord / TikTok / Meta), une étape à la fois.
- Signaler honnêtement ce qui n'est pas possible (ex. pas d'accès réseau, pas de génération d'images) et proposer l'alternative.
