# P360 Hub (prospect Adrien, agence PersonalBrand360)

Hub de prod pour un Head of Content : vidéos de l'idée à la publication, planning des tournages, espace client
(validation en 1 clic par lien perso), performances, SAV / relances automatiques, compta (marges par client,
paie des monteurs, factures, import du relevé bancaire).

Application à part du tracker (`../tracker`) : son propre service Railway, sa propre base SQLite.

## Lancer en local

```bash
cd hub && npm install
SEED_DEMO=1 ADMIN_PASSWORD=test1234 SESSION_SECRET=une-longue-phrase-secrete npm run dev
```

## Mettre en ligne (Railway)

1. Nouveau service depuis ce repo, **Root Directory** = `/hub`, branche de travail.
2. Un **volume** monté sur `/data`.
3. Variables : `DATABASE_PATH=/data/hub.db`, `ADMIN_PASSWORD` (choisi par Adrien), `SESSION_SECRET` (longue phrase au hasard),
   `PUBLIC_URL` (adresse du service), `SLACK_WEBHOOK_URL` (facultatif), `SEED_DEMO=1` seulement pour une démo.
   E-mails aux clients (relances) : `SMTP_URL` (ex. Gmail + mot de passe d'application : `smtps://adresse%40gmail.com:motdepasse@smtp.gmail.com:465`), `MAIL_FROM` facultatif.
   Sans `SESSION_SECRET`, le hub refuse de démarrer (sinon n'importe qui pourrait fabriquer une session).
4. Start command : `npm start`.

## Ce qui marche déjà

- Connexion par mot de passe (session signée, 30 jours).
- Lien client `/c/<token>` : le client ne voit et ne valide que ses vidéos (testé).
- Validation / demande de modif → statut enregistré, journal SAV, message Slack, paie du monteur (vidéo validée = son tarif).
- Relances automatiques toutes les heures : client après 48 h sans validation, monteur en retard (une fois par jour).
- Import CSV du relevé (Qonto, banque, Google Sheet), tri automatique, rangement à la main retenu, sans doublons.
- Réserver un spot → lieu du tournage + dépense « Tournage » en compta (recherche : ouvre Peerspace / Google avec les mots-clés).
- Relances client **par e-mail** (lien perso) ; sans e-mail, Adrien est prévenu sur Slack de relancer lui-même. Relance de paiement par e-mail (Compta → Factures).
- Le client regarde la vidéo dans sa page (lien Drive / mp4 lu depuis Notion), voit « Bientôt en ligne » (date de sortie), peut **annuler** une validation pendant 15 min.
- Vidéos validées → liste « À planifier » (Planning / Vidéos), la date part dans Notion. Nouveau tournage depuis le Planning.
- Page **Clients & monteurs** : prix / mois, e-mail, Instagram, tarif par vidéo, ID Slack.
- Notion : statut du hub renvoyé à la synchro suivante si Notion était en panne ; les vidéos déjà validées à l'import ne comptent pas dans la paie ; date de rendu → relance monteur.

## À brancher ensuite

- ~~Notion~~ : fait (page Connexions : clé collée par Adrien, synchro toutes les 10 min, « Validé » / modif renvoyés dans Notion).
- **Qonto** : mouvements en lecture seule (clé collée par Adrien dans l'outil).
- **Instagram** des clients : vues des reels (connexion officielle quand Meta aura validé l'app ; sinon Apify).
- Envoi du rapport mensuel par e-mail (aujourd'hui : lien sur Slack).
