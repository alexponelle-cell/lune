# Mise en ligne, étape par étape

Compte environ 45 minutes la première fois. On fait dans l'ordre :

1. Discord
2. YouTube
3. Apify
4. Railway
5. Réglages dans Discord

Garde un bloc-notes ouvert pour noter au fur et à mesure les valeurs marquées 📝.
**Ne les partage jamais** (ni sur Discord, ni dans le code) : c'est l'équivalent de mots de passe.

---

## Étape 1 : créer le bot Discord (10 min)

1. Va sur <https://discord.com/developers/applications>, clique sur **New Application** et donne-lui un nom (ex. « Lune Tracker »).
2. Dans l'onglet **General Information**, copie l'**Application ID**. 📝 `DISCORD_CLIENT_ID`
3. Dans l'onglet **Bot** :
   - clique sur **Reset Token**, puis copie le token. 📝 `DISCORD_TOKEN` (il ne s'affiche qu'une fois)
   - plus bas, dans **Privileged Gateway Intents**, active **MESSAGE CONTENT INTENT**, puis clique sur **Save**.
     Sans ça, le bot ne peut pas lire les liens postés dans le salon COMPTES.
4. Invite le bot sur le serveur. Ouvre ce lien après y avoir remplacé `TON_CLIENT_ID` :

   ```
   https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&scope=bot+applications.commands&permissions=85056
   ```

   Il donne les permissions « voir les salons, envoyer des messages, intégrer des liens, ajouter des réactions, lire l'historique ».
   Il faut être admin du serveur, ou demander à Loann/Laro de cliquer.
5. Récupère l'ID du serveur :
   - dans Discord, va dans **Paramètres utilisateur > Avancés** et active le **Mode développeur** ;
   - fais un clic droit sur l'icône du serveur, puis **Copier l'identifiant du serveur**. 📝 `DISCORD_GUILD_ID`
6. Vérifie que le bot a accès aux salons COMPTES. Si ce sont des salons privés, ajoute son rôle dans les permissions du salon.

> 💡 Pour commencer, fais tout ça sur un **serveur de test** perso. Une fois que tout marche, invite le bot sur le vrai serveur et change `DISCORD_GUILD_ID`.

## Étape 2 : clé YouTube (5 min, gratuit)

1. Va sur <https://console.cloud.google.com>, crée un projet (menu en haut à gauche, **Nouveau projet**).
2. Va dans **API et services > Bibliothèque**, cherche **YouTube Data API v3**, puis clique sur **Activer**.
3. Va dans **API et services > Identifiants > Créer des identifiants > Clé API**. 📝 `YOUTUBE_API_KEY`
4. (Conseillé) Clique sur la clé, puis **Restrictions relatives aux API**, et coche uniquement YouTube Data API v3.

## Étape 3 : compte Apify pour TikTok + Instagram (5 min)

1. Crée un compte sur <https://apify.com>. Le plan gratuit donne quelques $ de crédit par mois, largement assez pour tester.
2. Va dans **Settings > API & Integrations** et copie le **Personal API token**. 📝 `APIFY_TOKEN`

> Tu peux sauter cette étape au début : YouTube marchera seul, et les comptes TikTok/Insta afficheront juste une erreur « APIFY_TOKEN manquant » dans le dashboard.

## Étape 4 : mettre en ligne sur Railway (15 min, ~5 $/mois)

1. **Mets le code sur `main`.** Railway déploie une branche : fusionne la PR du tracker dans `main`.
   Tu peux aussi choisir la branche `claude/project-foundations-r1b3km` à l'étape 3 ci-dessous.
2. Crée un compte sur <https://railway.com> **avec ton GitHub**, puis prends le plan Hobby (5 $/mois).
3. Clique sur **New Project > Deploy from GitHub repo** et choisis `alexponelle-cell/lune`.
   Si le repo n'apparaît pas, clique sur **Configure GitHub App** et donne l'accès au repo.
4. Clique sur le service créé, puis va dans l'onglet **Settings** :
   - **Source > Root Directory** : `/tracker`
   - **Config-as-code > Railway Config File** : `/tracker/railway.json`
   - **Source > Branch** : `main`, ou la branche du tracker
5. **Ajoute le disque** où la base de données sera gardée :
   - fais un clic droit sur le service, puis **Attach Volume** ;
   - dans **Mount path**, mets `/data`.

   ⚠️ Sans volume, toutes les données sont effacées à chaque redéploiement.
6. Onglet **Variables**, puis **Raw Editor**, et colle ceci en remplaçant par tes valeurs 📝 :

   ```
   DISCORD_TOKEN=...
   DISCORD_CLIENT_ID=...
   DISCORD_GUILD_ID=...
   FETCHER_MODE=live
   YOUTUBE_API_KEY=...
   APIFY_TOKEN=...
   DASHBOARD_PASSWORD=choisis-un-mot-de-passe-solide
   ```

7. Dans l'onglet **Settings > Networking**, clique sur **Generate Domain**. Railway donne une URL du type `lune-tracker-production.up.railway.app`.
   Ajoute ensuite la variable `PUBLIC_URL=https://<cette-url>`.
8. Railway redéploie tout seul. Dans l'onglet **Deployments > View logs**, tu dois voir :

   ```
   INFO  dashboard sur https://...
   INFO  4 commandes enregistrées sur le serveur ...
   INFO  bot connecté en tant que Lune Tracker#1234
   ```

   Le bot doit apparaître **en ligne** sur Discord.

## Étape 5 : régler les clients dans Discord (5 min)

Dans n'importe quel salon du serveur, avec un compte admin, crée chaque client :

```
/client nom:Loann tarif:1 salon:#comptes-loann
/client nom:BeOne tarif:0.8 salon:#comptes-beone min_vues:10000 plafond:500
```

- `tarif` : € versés pour 1 000 vues
- `min_vues` (optionnel) : en dessous de ce nombre de vues sur la période, le clipper touche 0
- `plafond` (optionnel) : maximum en € par clipper et par période

La commande est relançable à tout moment pour changer un tarif.

## Étape 6 : tester le parcours complet

1. Dans `#comptes-loann`, poste un vrai lien, par exemple `https://www.youtube.com/@unechaine`. Le bot doit réagir ✅ et répondre « Suivi activé ».
2. Attends la collecte suivante (au plus 1 h), ou redémarre le service dans Railway (**Deployments > Restart**) pour la lancer tout de suite.
3. Ouvre l'URL Railway : le navigateur demande un identifiant (mets ce que tu veux) et le mot de passe `DASHBOARD_PASSWORD`.
4. `/stats` et `/classement` sur Discord.

> Les vues « gagnées » partent de 0 au moment de l'enregistrement : il faut **au moins 2 collectes** (donc ~1 h) avant de voir des chiffres, et 48 h pour la première comparaison « vs hier ».

---

## En cas de souci

| Symptôme | Cause probable |
| --- | --- |
| Le bot est hors ligne | `DISCORD_TOKEN` faux, ou le service a crashé : regarde les logs Railway |
| Le bot ne réagit pas aux liens | *Message Content Intent* pas activé, salon pas lié via `/client ... salon:`, ou le bot ne voit pas le salon |
| Les commandes `/` n'apparaissent pas | `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID` faux (voir les logs). Relance Discord (Ctrl+R) |
| Erreur sous un compte dans le dashboard | Clé API manquante ou fausse, compte privé, ou scraper Apify qui a changé : envoie-moi le message d'erreur |
| Les données disparaissent après un déploiement | Pas de volume monté sur `/data` (étape 4.5) |

## Réglages optionnels (variables Railway)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `COLLECT_INTERVAL_MINUTES` | 60 | Fréquence de récupération des vues (plus souvent = plus de crédits Apify) |
| `INACTIVITY_DAYS` | 3 | Jours sans post avant relance |
| `DROP_THRESHOLD_PERCENT` | 30 | % de baisse de vues qui déclenche une relance |
| `DROP_WINDOW_DAYS` | 7 | Période comparée pour la baisse |
| `RELANCE_COOLDOWN_HOURS` | 24 | Délai minimum entre deux relances du même type |
| `VIDEOS_PER_ACCOUNT` | 30 | Vidéos récentes récupérées par compte |
