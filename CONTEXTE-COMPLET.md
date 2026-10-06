# Neptune / « lune » : tout le contexte

Ce document est la mémoire complète du projet, pour qu'une nouvelle session Claude puisse reprendre exactement là où
on en est, avec la même façon de penser. Il complète `CLAUDE.md`, qui le charge automatiquement.
**À tenir à jour** à chaque étape importante (section 12).

---

## 1. Les personnes et la façon de travailler

### Alex
- Francophone, **non technique**, **mineur**. Il dirige l'agence avec **Lucas** et un 3ᵉ associé.
- Il écrit vite, en abrégé, avec des fautes (« c bn », « jsp », « ya », « tt », « pr », « mtn », « frerot », « GO »).
  Comprendre l'intention, ne pas corriger.
- Il veut des **réponses très courtes**. « + conscis » ou « +++ conscis » = beaucoup trop long, il faut diviser par 3.
  Format idéal : 3 à 6 lignes, ou une liste d'étapes numérotées.
- « GO » = fais-le tout de suite, sans redemander. « c » ou « c bon » = étape faite, donne la suivante.
- « step by step » = **une seule action à la fois**, avec le nom exact du bouton où cliquer.
  « ts les steps d'un coup » = la liste complète d'un coup.
- Il envoie beaucoup de **captures d'écran**. Les lire attentivement : souvent la réponse y est
  (mauvais champ rempli, bouton pas sauvegardé, mauvais compte connecté…).
- Il teste lui-même sur Railway, Discord, TikTok Developers, Meta, Apify. On le guide clic par clic.
- Il pousse pour aller vite (« on peut rien faire mtn ? vraiment productif mtn GO »).
  Quand quelque chose bloque côté externe (validation TikTok, Meta…), proposer ce qu'on peut avancer en parallèle.
- Il remet parfois en question (« tu sais ce que tu fais hein ? », « pk on supp ? »).
  Expliquer le pourquoi en une phrase, calmement.

### Lucas
- Associé. Il envoie des listes d'idées et des priorités (via Alex, souvent en capture WhatsApp).
- Sa ligne : « limite au max les dépenses quitte à ce que ça s'actualise moins ou que ça prenne du temps ».
- Sa dernière liste :
  - sites v1 pour les prospects (Cubi Game, Croshoot, Josplay, Nighting) ;
  - « Apify maison » ou une solution gratuite (réponse : les connexions officielles TikTok / Instagram) ;
  - améliorer le système avec sa data ;
  - une IA qui répond aux clippeurs à partir des tutos, conférences et ateliers.

### Autres noms
- **Laro** : membre de l'équipe ou d'un ancien système. L'ancien site « Neptune Academy » venait de lui (« le truc de laro »).
  Il signale aussi des erreurs (Apify, par exemple).
- **Elie**, **Science**, **Sabr** : noms vus dans la structure du serveur des monteurs.
  La structure d'Elie a servi de modèle.
- **Adrien / 2spi** : un funnel de serveur avait été fait pour lui. Mis de côté (« oublie le 2spi »).
- Comptes de test :
  - **kzom4** : TikTok de test, en Sandbox. Il était relié au clippeur « Paul.clipping », hors agence.
  - **alexponelle** : compte Instagram pro d'Alex, qui a servi au test Instagram.

### Règles de sécurité (non négociables)
- Ne **jamais** demander, afficher, répéter ni committer un token, une clé API, un mot de passe ou un secret.
  Alex les colle lui-même dans **Railway → service → Variables**. Lui dire : « Ne m'envoie aucune valeur ».
  S'il en colle une par erreur dans le chat : lui dire de la régénérer.
- Ne jamais committer `token.txt` ni de fichier `.bat` contenant des secrets (`discord-setup/start-bot.bat` existe, attention).
- Ne jamais mettre de nom de modèle d'IA dans les commits ou les PR.
- Pas de PR sauf si Alex la demande explicitement.
- Alex est mineur. Pour les démarches administratives (entreprise, Meta, paiements), passer par ses parents.
  Ne jamais suggérer de contourner une vérification d'âge ou d'identité.

### Ma façon de penser (à reproduire)
1. **Comprendre le vrai problème** derrière la demande. Exemples :
   - « la file est ingérable » → automatiser le tri, pas juste expliquer la file ;
   - « Apify coûte cher » → espacer les relevés, puis passer aux API officielles gratuites.
2. **Gratuit d'abord.** Chaque fonctionnalité doit coûter 0 € si possible. Sinon, le dire clairement avec le prix max.
3. **Réutiliser l'existant** : les gabarits du site, les configs créateurs, les fonctions déjà testées.
   Exemple : les maquettes prospects ont été refaites sur le vrai site, parce qu'Alex trouvait les premières « pas au niveau ».
4. **Livrer vérifié** : `npx tsc --noEmit`, `npx vitest run`, et une capture d'écran Playwright pour tout ce qui est visuel.
   Ensuite seulement : commit, push, et une explication courte.
5. **Toujours dire ce qu'Alex doit faire ensuite**, de façon concrète : où cliquer, quelle variable ajouter, quand redéployer.
6. **Honnêteté** : dire ce qui n'est pas possible, par exemple « je ne peux pas ouvrir croshop.fr d'ici » ou « je ne génère pas d'images ».
   Proposer l'alternative : envoyer une capture, découper l'image dans ses captures, etc.
7. **Messages Discord** : ton chaleureux, emojis, phrases courtes, vocabulaire de jeunes. Les exemples sont dans `tracker/src/creators/*.ts`, champ `discord`.

---

## 2. Le business

- **Neptune** est une agence de clipping. Des clippeurs postent des extraits (« clips ») des vidéos d'un créateur YouTube
  sur TikTok, Instagram Reels et YouTube Shorts. Ça fait connaître le créateur.
- **Deux modèles** coexistent :
  1. **Agence** : des clippeurs « pros » sont payés en € pour 1 000 vues, avec un barème par client
     (minimum de vues, plafond). Suivis dans Mars.
  2. **Programme fans** : des fans clippent gratuitement et gagnent des **coins** (10 coins pour 1 000 vues par défaut).
     Ils les échangent contre une **récompense** dans la boutique du site. C'est le cœur actuel.
- Pour chaque créateur, il y a **un site fans** (vues → coins → boutique), **un serveur Discord** monté par `/setup`,
  et **un bot** (une application Discord par créateur).

### Créateurs actifs

| Créateur | Programme | Gabarit du site | Récompense | Livraison |
| --- | --- | --- | --- | --- |
| **BeOne** (@BeOnePourcent) | BEONE REWARDS | `playful` (clair, jaune), `fan.html` | objets / gamepass dans son jeu Roblox | automatique via l'API du jeu (`GAME_API_URL` / `GAME_API_TOKEN`), pseudo Roblox |
| **SQUIDUU** | SQUIDUU | `sober` (noir #0B0A0C, jaune #FCD005, Montserrat) | 1 mois de Squiduuverse = 10 000 coins | automatique via l'API Squiduuverse (`SQUIDUU_API_URL` / `TOKEN`), e-mail Google, orderId anti-doublon |
| **DEBO** (DEBO PLAYS) | DEBO PLAYS | `pop` (multicolore animé, Nunito) | 50 Robux pour 1 000 coins (100 000 vues) | Robux à la main, pseudo Roblox |
| **Loann** (@LoannLV + 2ᵉ chaîne) | LOANN CLIPPING | `pop` + `sticker` (Baloo 2, contours noirs, bandeau défilant) | 1 mois de Merguez Superstar (ms-creators.com) = 10 000 coins | e-mail |

### Historique et état
- **SQUIDUU** : campagne officiellement lancée. Le parcours complet a été testé de bout en bout. Les clippeurs sont arrivés.
- **Loann** : « on met les bouchées doubles ». Test d'inscription à faire.
- **Josplay** : un call a eu lieu. Il reste à trouver comment rémunérer ses clippeurs (récompense non définie).

### Prospects
- **Cubi Game** (Roblox, noir et blanc). Récompense envisagée : Roblox Academy.
- **Croshoot** (boutique croshop.fr, peluche Bob à 29,99 €).
- **Josplay** (Mii, bleu #7BC7EA). Ses chaînes : @josplay012 (573 k), @JosplayGaming, @Josplay2.
- **Nighting** : maquette pas encore faite. Attendre son prompt de DA et ses captures.

### Autres outils
- **Mars** : le dashboard staff (DA rouge martien, « Developed by Neptune »).
- **Serveur des monteurs** : « Agence PersonalBrand360 ».

---

## 3. Architecture technique (`tracker/`)

- **Stack** : Node ≥ 22, TypeScript ESM, discord.js v14, better-sqlite3, Hono (`@hono/node-server`), zod, vitest, tsx.
- **Scripts** :
  - `npm run dev` : tsx watch ;
  - `npm run build` : tsc et copie de `src/web/app` vers `dist/web/` ;
  - `npm start` ;
  - `npm test` ;
  - `npm run register-commands`.
- **Vérifier avant chaque push** : `cd tracker && npx tsc --noEmit && npx vitest run` (94 tests, 8 fichiers dans `test/`).

### Dossiers

| Chemin | Rôle |
| --- | --- |
| `src/index.ts` | Démarrage : config, DB, fetchers (YouTube / TikTok / Instagram / Apify), bots, serveur web, tâches planifiées |
| `src/config.ts` | Variables d'environnement validées par zod (liste en section 5) |
| `src/creators/` | **Config de chaque créateur** (`beone.ts`, `squiduu.ts`, `debo.ts`, `loann.ts`), le type dans `types.ts` et `index.ts` (`CREATORS`). `prospects.ts` = les maquettes |
| `src/db/schema.ts` | Migrations SQLite numérotées (**v17** actuellement). Toujours ajouter une nouvelle version, ne jamais modifier une ancienne |
| `src/db/repo.ts`, `src/db/fans.ts` | Accès aux données (agence, fans) |
| `src/domain/` | Logique pure testable : `coaching.ts`, `links.ts` (parse des liens de profils), `remuneration.ts`, `time.ts`… |
| `src/services/` | `agency.ts` (stats, coaching, erreurs lisibles), `fans.ts` (programme fans : coins, boutique, classement, tri des comptes, connexions officielles), `game.ts` (API du jeu Roblox), `emailGrant.ts` (livraison par e-mail / API), `clipCheck.ts` (vérif des légendes), `training.ts` (formation), `recruitment.ts`, `analytics.ts` |
| `src/platforms/` | Fetchers de vues : YouTube (API officielle), Apify (TikTok / Insta), `tiktokOfficial.ts`, `instagramOfficial.ts`, `oauthTokens.ts` |
| `src/jobs/` | `collect.ts` (relevés : quels comptes, quand), `relance.ts` (relance des clippeurs inactifs), `scheduler.ts` (`every()`) |
| `src/bot/` | Bots Discord : `commands.ts` / `register.ts` (commandes), `fanServer.ts` (/setup du serveur créateur), `fans.ts` (inscription, /site, /coins), `fanAutomation.ts` (rôles de niveau, top 3, nouvelles vidéos, level-up), `community.ts`, `comptes.ts` (salon de liens), `montage.ts` (serveur des monteurs), `recruitment.ts` |
| `src/web/server.ts` | Toutes les routes HTTP (section 6) |
| `src/web/sober.ts` | Rendu du site fans `sober` / `pop` (`soberPage`) et des maquettes (`demoPage`) |
| `src/web/legal.ts` | Pages de confidentialité et de conditions (exigées par TikTok et Meta) |
| `src/web/app/` | Le front : `fan-sober.html` (site fans `sober` / `pop` / `sticker`), `fan.html` (BeOne `playful`), `index.html` + `app.js` + `app.css` (Mars), `formation.html` (Neptune Academy), `login.html`, `fan/` (visuels des créateurs), `demo/` (visuels des prospects) |
| `roblox/NeptuneRewards.server.lua` | Script côté jeu Roblox (livraison BeOne) |
| `scripts/` | `register-commands.ts`, `seed.ts` |
| `DEPLOY.md` | Guide de mise en ligne pas à pas (Discord, YouTube, Apify, Railway) |
| `../discord-setup/` | Ancien script Python de setup Discord (historique) |

### Tables SQLite
`clients`, `clippers`, `accounts`, `videos`, `video_snapshots`, `account_snapshots`, `settings`, `reward_rules`,
`shop_items`, `shop_orders`, `fan_tokens`, `fan_notifications`, `fan_notified`, `fan_notify_state`, `strikes`,
`feedbacks`, `relances`, `requests`, `candidatures`, `tests`, `recruiters`, `departures`, `channel_messages`,
`voice_sessions`, `tiktok_tokens`, `instagram_tokens`.
- v15 : `tiktok_tokens`.
- v16 : `instagram_tokens`.
- v17 : ces deux tables recréées avec `ON DELETE CASCADE`, pour qu'on puisse supprimer un clippeur.

---

## 4. Fonctionnement détaillé

### Inscription d'un fan (serveur créateur)
Le parcours du serveur monté par `/setup` (`fanServer.ts`) :
1. **👋 bienvenue**, puis **📜 règles** et **🧭 déroulement**. Le fan accepte les règles et reçoit le rôle `✅ Règles acceptées`.
2. **🎓 tutos** : la formation **Neptune Academy** sur `/formation`. Ce sont des modules à cocher (6 vidéos YouTube par défaut, ou des .mp4).
   Quand tout est coché, il reçoit le rôle `🎓 Formation validée`.
3. **📝 inscription** : bouton « S'inscrire ». Il remplit un formulaire avec ses comptes TikTok / Insta / YouTube
   (3 obligatoires) et son compte de livraison (e-mail ou pseudo Roblox selon le créateur).
   Il reçoit le rôle `🎬 1er clip à poster`, puis `🎬 Clippeur` quand son 1er clip est détecté, ce qui débloque la communauté.
4. Communauté : 📣 annonces, 💬 général, 🎥 mes-clips, ❓ aide.
   Plus : classement du lundi (top 10, rôle `🏆 Top 3 de la semaine`), level-up (paliers = objets de la boutique),
   nouvelles vidéos (vidéos longues seulement, rôle `🔔 Alerte vidéos`).
5. Côté staff : log des inscriptions, 💬 staff, rôles `🛡️ Staff` et `👑 Head of Clipping 👑`
   (il voit tous les salons staff et privés), plus un salon privé par clippeur.

Autres détails :
- Les membres ne peuvent pas faire @everyone / @here.
- Le **#tag** (mot-clé du créateur, ex. #squiduu) est rappelé seulement aux moments clés : les règles et le salon privé.
- `/site` envoie au fan son lien de connexion au site. `/coins` affiche ses vues et ses coins.

### Anti-triche
Un clip rapporte des coins seulement si les 3 conditions sont réunies :
1. le compte est **vérifié** ;
2. le clip est **publié après l'ajout du compte** (les vieilles vidéos qui montent ne rapportent rien) ;
3. `clip_check = 'ok'` : la **légende cite le créateur** (mots-clés `clipKeywords`, son nom, ses chaînes ; règle activable dans Mars).
   Les clips d'avant cette règle sont acceptés.

Le reste :
- **Tri automatique des comptes** (`autoReviewAccounts`, après le 1er relevé) :
  - moins de 10 000 abonnés et aucune vidéo à 100 000 vues ou plus → validé automatiquement ;
  - sinon → file **« Comptes à vérifier »** dans Mars (lien du profil et derniers clips, Valider / Refuser).
- Un compte **connecté officiellement** (TikTok ou Instagram OAuth) est vérifié d'office : la connexion prouve qu'il appartient au fan.
- Un compte ne peut être suivi qu'une seule fois (doublons détectés par l'ID réel de la plateforme).
- Les **achats sont validés par le staff** avant livraison : Mars montre les clips qui ont rapporté les coins.
- Anti-force brute sur le mot de passe de Mars.
- Il a existé une vérification par code dans la bio, et une IA qui comparait les clips au créateur.
  Elles ont été remplacées par le mot-clé et les connexions officielles, qui sont gratuits.

### Relevés de vues (`jobs/collect.ts`, `index.ts`)
- **Fans** : chaque nuit juste après minuit, heure de Paris (`parisMidnight`).
  - Comptes **gratuits** (YouTube, TikTok ou Insta connectés) : chaque nuit.
  - Comptes **payants** (Apify) : toutes les 2 nuits ; 1 fois par semaine si aucune nouvelle vidéo depuis 14 jours ;
    toutes les 2 semaines si le compte est vide (`fanAccountDue`, `paidAccount`).
  - On lit 5 vidéos par compte fan et 10 par compte agence.
- **Agence** : comptes Apify relevés 1 fois par jour.
- **Relevé manuel** depuis Mars (« Relever les vues maintenant », 1 fois par heure max) : seulement les comptes gratuits et les comptes jamais relevés.
  Il inclut aussi les comptes connectés hors agence.
- **Calcul des vues** : le 1er relevé sert de référence. Le total du compte = la somme des dernières vues connues de toutes ses vidéos.
  Les vues gagnées = la différence sur des fenêtres glissantes.
- Les erreurs sont rendues lisibles (`readableError`) : quota Apify dépassé (« hard limit »), compte introuvable, connexion expirée.

### Connexions officielles (gratuites, remplacent Apify)

**TikTok** (`tiktokOfficial.ts`), via Login Kit et Display API :
- scopes `user.info.basic,user.info.profile,user.info.stats,video.list`, `disable_auto_auth=1` (la page d'autorisation s'affiche toujours) ;
- jetons renouvelés automatiquement ;
- routes `/fan/tiktok/connect` et `/fan/tiktok/callback`.
- **Vérification du site** par URL prefix : le fichier `tiktok<code>.txt` est servi à la racine.
  Il suffit de mettre le contenu `tiktok-developers-site-verification=…` dans `TIKTOK_VERIFY_FILE` ou `TIKTOK_VERIFY_CONTENT` : le nom du fichier s'en déduit.
  L'URL Web dans TikTok doit finir par `/`.

**Instagram** (`instagramOfficial.ts`), via API with Instagram Login :
- scopes `instagram_business_basic,instagram_business_manage_insights` ;
- jeton court échangé contre un jeton long de 60 jours, renouvelé automatiquement ;
- le compte doit être **pro ou créateur** : le site explique comment passer en créateur, gratuitement ;
- seuls les reels sont lus. Métrique : `views`, sinon `plays`.

Commun aux deux :
- Si les clés sont présentes, le fetcher officiel enveloppe Apify : compte connecté → API officielle, sinon → Apify,
  sauf si `*_APIFY_FALLBACK=0` (dans ce cas, erreur « pas connecté »).
- Après une connexion réussie, le fan est renvoyé sur `/fan?connected=<plateforme>#clipper` avec un toast.
- Le site affiche « ✅ connecté » et un lien « Reconnecter », ou le bouton « Connecter mon TikTok / Instagram ».

### Site fans
- Pages : Accueil (hero, comment ça marche, top de la semaine, FAQ), Récompenses, Clipper (comptes suivis, connexions officielles, mes clips),
  Classement, Profil (niveau, badges, compte de livraison, notifications Discord, échanges).
- Les coins s'affichent seulement sur les clips qui rapportent. Les autres portent la mention « ne rapporte pas ».
- Le gabarit lit la config du créateur (`/api/fan/public`) : couleurs, police, textes avec `**…**` mis en accent, FAQ, ticker.
  Les visuels sont dans `src/web/app/fan/` (`images.banner`, `images.reward`). La photo HD du créateur vient de YouTube.
- Couleur de mise en avant configurable via `colors.highlight` (violet par défaut).
  Les polices à graisse unique (Lilita One…) sont gérées dans `sober.ts`.

### Mars (dashboard staff, `index.html` + `app.js`)
- Pages : Vue Agence (KPI, dont « Clippeurs actifs » ; « CA généré » a été retiré), clippeurs, classement, inspiration, management,
  rémunération, paramètres, suivi du recrutement, et le programme fans (boutique, commandes, comptes à vérifier, réglages, ± coins).
- **Classement** : colonne « Vues qui comptent », à côté des vues brutes.
  ⚠️ si plus de 1 000 vues et moins de 20 % qui comptent.
- **Fiche coaching** par clippeur, sur 30 jours (`domain/coaching.ts`) :
  - comparaison à l'équipe, flops, meilleure plateforme, plateforme absente ;
  - meilleur créneau, régularité, clips sans #tag, comptes en erreur ;
  - meilleur et pire clip.

  Ça sert de base aux feedbacks vocaux.
- **Un Mars par créateur** (un service Railway chacun). Le menu « Programme » bascule de l'un à l'autre sans se reconnecter, avec un lien signé.
  La variable `MARS_SITES` les liste.
- Pour supprimer quelqu'un : page clippeurs, puis supprimer. Ses jetons TikTok / Insta sont supprimés aussi (CASCADE).

### Serveur des monteurs (`bot/montage.ts`, commande `/setup-montage`)
- Structure validée par l'équipe :
  - **📦 ressources** : communes, en lecture seule ;
  - puis **une section par créateur** : 📣 annonces, 👱 ressource, 💬 général ;
  - et le **salon privé**.
- Pas de salon de feedback ni « à publier » (« c'est le centre de pilotage qui gère »).
- Les head of / staff postent, les monteurs lisent.
- Option `nettoyer`, ou bouton 🧹 « Supprimer tous les autres salons » : supprime tout ce qui n'est pas dans la structure (les salons d'abord, puis les catégories).
- Les salons existants sont reconnus même s'ils ont été renommés, et sont alors renommés proprement.

### Maquettes prospects (pour chauffer le prospect en call)
- `src/creators/prospects.ts` (`PROSPECTS`) : une config créateur complète par prospect, plus ses visuels dans `src/web/app/demo/`.
- `/demo/<slug>` sert **le vrai site fans** à la charte du prospect (`demoPage` dans `sober.ts`) :
  données d'exemple (classement avec des pseudos inventés), connexion désactivée, badge « Maquette ».
- Versions autonomes envoyées à Alex : `maquette-<slug>.html` à la racine (images intégrées en base64).
  Ce sont celles qu'il ouvre et montre en call. Le script de génération est décrit en section 9.
- Prospects faits :
  - **cubi-game** : noir et blanc, Space Grotesk, PDP du cube, carte Roblox Academy ;
  - **croshoot** : pop + sticker, rouge #B51E32 / #C72B41, brun #201820, jaune #FFB800, Lilita One, bannière désert, peluche Bob ;
  - **josplay** : bleu #7BC7EA et blanc, Fredoka, Mii.
- Procédure pour un nouveau prospect (Nighting) :
  1. Alex envoie un prompt de DA et des captures.
  2. Donner un avis très court sur le prompt (ce qui manque : visuels HD, récompense, mot-clé).
  3. Découper les visuels dans ses captures avec PIL. Les captures sont dans le dossier d'images de la session.
  4. Ajouter l'entrée dans `PROSPECTS`.
  5. Générer le HTML autonome, faire une capture Playwright et vérifier.
  6. Commit, push, et envoyer le fichier.
- Le prompt de DA d'Alex demande souvent : aucun slogan, des zones de contenu vides, la mascotte non modifiée,
  et une énergie de jeu « sans copier » (Brawl Stars pour Croshoot).

---

## 5. Variables d'environnement (Railway → Variables, valeurs jamais dans le chat)

| Variable | Rôle |
| --- | --- |
| `CREATOR` | beone / squiduu / debo / loann : quel créateur ce service sert |
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` | Bot de l'agence (Mars, monteurs, recrutement) |
| `FANS_BOT_TOKEN`, `FANS_BOT_CLIENT_ID`, `FANS_BOT_GUILD_ID` | Bot du créateur (serveur des fans) |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | Connexion Discord au site fans |
| `PUBLIC_URL` | URL publique du service (pour les liens et les redirect URIs) |
| `DASHBOARD_PASSWORD` | Mot de passe de Mars |
| `MARS_SITES` | Liste des autres Mars, pour le menu Programme |
| `NEPTUNE_API_KEY` | API Neptune (liaisons et points) |
| `FETCHER_MODE` | `live` en prod (`mock` = faux relevés) |
| `YOUTUBE_API_KEY` | API YouTube (gratuite) |
| `APIFY_TOKEN` | Apify (payant), pour TikTok et Insta non connectés |
| `VIDEOS_PER_ACCOUNT` | Plafond de vidéos lues |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_APIFY_FALLBACK` | TikTok officiel (**retirées pour l'instant**) |
| `TIKTOK_VERIFY_FILE` / `TIKTOK_VERIFY_CONTENT` | Fichier de vérification du site TikTok |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_APIFY_FALLBACK` | Instagram officiel (**retirées pour l'instant**) |
| `GAME_API_URL`, `GAME_API_TOKEN`, `ROBLOX_API_KEY` | Jeu Roblox de BeOne (livraison) |
| `SQUIDUU_API_URL`, `SQUIDUU_API_TOKEN` | Livraison automatique Squiduuverse |
| `DATABASE_PATH` | Base SQLite (sur un volume Railway) |
| `WEB_PORT` | Port du serveur web |
| `COLLECT_INTERVAL_MINUTES`, `RELANCE_*`, `INACTIVITY_DAYS`, `DROP_*` | Fréquences et seuils de relance |

---

## 6. Routes HTTP principales (`src/web/server.ts`)

- **Public / fans** :
  - `/fan` (site), `/fan/assets/:name`, `/fan/login`, `/fan/auth/discord` + `/callback`, `/fan/logout` ;
  - `/fan/{tiktok,instagram}/{connect,callback}` ;
  - `/api/fan/public`, `/api/fan/me`, `/api/fan/account`, `/api/fan/orders`, `/api/fan/notify`, `/api/fan/roblox` ;
  - `/formation`, `/api/formation`.
- **Divers publics** : `/legal/privacy`, `/legal/terms`, `/demo/:slug`, `/demo/assets/:name`, `/healthz`, fichier de vérification TikTok.
- **Jeu et Neptune** : `/api/roblox/pending`, `/api/roblox/delivered`, `/api/neptune/*`.
- **Mars** (protégé par mot de passe) :
  - `/`, `/login`, `/sso`, `/api/mars/*` ;
  - `/api/overview`, `/api/leaderboard`, `/api/clippers/:id`, `/api/fans`, `/api/fans/refresh`, `/api/shop/*`, `/api/rewards/*` ;
  - `/api/recruitment/*`, `/api/suivi`, `/api/discord/*`, `/api/export.csv`, etc.

## 7. Commandes Discord

- **Bot agence** : `/stats`, `/classement`, `/client`, `/retirer-compte`, `/avis`, `/inscription` (agence), `/setup-montage [nettoyer]`.
- **Bot créateur** : `/setup` (monte ou met à jour le serveur), `/site`, `/coins`, `/inscription`.
- Les commandes sont enregistrées sur chaque serveur, y compris quand le bot est invité après son démarrage.
  `/setup` affiche le service et la version qui répondent, pratique pour diagnostiquer.

## 8. Déploiement (Railway)

- Un **service par créateur**, tous depuis ce repo et cette branche :
  - `lune` : BeOne, l'agence et Mars, https://lune-production-dbd1.up.railway.app ;
  - `squiduu`, `Debo`, `loann`.
- Chaque service a sa variable `CREATOR` et ses propres secrets.
- Un push sur la branche déclenche le redéploiement. Sinon, bouton **Deploy** sur Railway.
- Pour lire les logs : Railway, service, Deployments, View logs. Demander une capture à Alex, puisque l'agent n'a pas accès à Railway.
- Plan Railway : Hobby, environ 5 $ par mois.
- Le guide complet de la première mise en ligne est dans `tracker/DEPLOY.md`.

## 9. Outils de l'agent (environnement cloud)

- Le réseau sortant bloque souvent Apify, Railway, croshop.fr, HuggingFace et Whisper.
  Impossible donc de transcrire un vocal WhatsApp : demander à Alex de l'écrire.
- Captures de pages : Playwright, avec `NODE_PATH=$(npm root -g)` et `executablePath: '/opt/pw-browsers/chromium'`.
  Ne pas lancer `playwright install`.
- Les images envoyées par Alex arrivent dans le dossier `images/` de la session.
  On les découpe avec PIL (python3) pour en faire des visuels (mascotte, bannière, produit).
- Générer les maquettes autonomes : petit script `tsx` qui importe `demoPage` depuis `tracker/src/web/sober.ts`,
  lit `fan-sober.html`, remplace les visuels par des data URIs et écrit `maquette-<slug>.html`.
- Un « localhost » ne sert à rien : il tournerait dans le conteneur cloud, pas chez Alex.
  Il faut envoyer le fichier HTML (il s'ouvre comme un site) ou passer par l'URL Railway.

---

## 10. Problèmes déjà rencontrés (et leur solution)

- **« File staff ingérable »** : tri automatique des comptes. Seuls les gros comptes vont au staff.
- **Crédit Apify gratuit (5 $) épuisé** :
  - économies sur les relevés (nuit, toutes les 2 nuits, comptes vides espacés) ;
  - puis connexions officielles ;
  - en attendant : Apify Starter à 19 $, avec un plafond (Limits) de 19 $.
- **`/setup-montage nettoyer` « n'a rien supprimé »** : l'option n'était pas prise. Ajout du bouton 🧹.
- **Comptes de test « disparus »** : kzom4 était relié à un autre clippeur (Paul.clipping, hors agence).
  Le relevé manuel inclut maintenant les comptes connectés hors agence.
- **« Reconnecter » TikTok sans page d'autorisation** : ajout de `disable_auto_auth=1`.
- **Production TikTok vide** : le formulaire n'avait jamais été sauvegardé. Il a fallu le remplir à nouveau.
- **Vérification du site TikTok** : Alex avait mis le contenu dans la mauvaise variable. Le nom du fichier se déduit maintenant du contenu.
  Autre erreur : l'URL sans `/` final.
- **Pastilles des comptes invisibles** (blanc sur blanc, site BeOne) : couleur `var(--ink)`.
- **Badges « +coins » trompeurs** : affichés seulement si le clip compte.
- **Premières maquettes trop simples** (« pas au niveau de SQUIDUU / BeOne ») : refaites sur le vrai gabarit du site.
- **Erreur dans developers.tiktok** : provoquée par un point final dans un champ.

---

## 11. Les comptes développeurs (état)

- **TikTok for Developers** :
  - app créée (catégorie, URL du site, pages légales, site vérifié) ;
  - testée en Sandbox avec kzom4 : vidéos et vues remontent ;
  - **demande de validation Production envoyée** avec une vidéo de démo ;
  - quand c'est validé : clés Production sur les 4 services, Redirect URIs des 3 autres sites, puis `TIKTOK_APIFY_FALLBACK=0`.
- **Meta (Instagram)** :
  - app créée, testée avec alexponelle (reels et vues remontent), démo filmée ;
  - **bloqué par la vérification d'entreprise** ;
  - il manque aussi l'icône de l'app ;
  - ensuite : demande de validation, clés sur les 4 services, Redirect URIs, `INSTAGRAM_APIFY_FALLBACK=0`.
- Les clés TikTok et Instagram ont été **retirées de Railway** en attendant (les tests sont finis).

## 12. Administratif et argent

- Alex n'a pas d'entreprise. Il est mineur et crée une **micro-entreprise avec ses parents**
  (guichet unique INPI, ses parents comme représentants ou avec leur autorisation). C'est la priorité, pour Meta.
- Lucas a une micro-entreprise, mais elle est peut-être inutilisable (« s'est fait bz »). Alex préfère créer la sienne.
- **Coûts actuels** :
  - Apify Starter : 19 $/mois, plafonné à 19 $ ;
  - Railway Hobby : environ 5 $/mois ;
  - YouTube API : gratuit.
- **Objectif** : 0 € de relevés grâce aux connexions officielles, puis couper Apify.

## 13. À faire (priorités)

1. **Micro-entreprise** (Alex et ses parents), puis vérification d'entreprise Meta, puis validation Instagram (avec l'icône de l'app).
2. **Validation TikTok** à surveiller. Ensuite : clés Production, Redirect URIs, coupure d'Apify.
3. **Maquette Nighting** : attendre son prompt et ses captures.
4. **Josplay** : définir la récompense et la rémunération des clippeurs. Remplir la boutique de la maquette.
5. **IA « clipper »** : la FAQ auto gratuite du salon ❓│aide est faite (`domain/faq.ts`). Prochaine étape : y ajouter les contenus de Lucas (tutos, conférences, ateliers).
6. Améliorer le système avec la data de Lucas.
7. Loann : test d'inscription complet.
8. Idée en attente : voir qui n'est pas en ligne sur Discord, dans tous les salons
   (« faut que on voit ceux qui sont pas en ligne sur discord dans tous les cahnelles »). À clarifier avec Alex.
9. Prix des maquettes à confirmer : peluche Bob à 30 000 coins, Roblox Academy à 10 000.
