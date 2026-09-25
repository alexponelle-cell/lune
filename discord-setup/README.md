# Bot constructeur du serveur Discord

Invité sur un serveur vide, il monte tout le serveur (rôles, salons, permissions, icône, messages),
puis reste en ligne pour l'accueil, les candidatures, les relances et les départs.
Relancer le bot ne crée jamais de doublons.

## À faire une seule fois

1. **Créer le bot** : https://discord.com/developers/applications → New Application → onglet **Bot**
   - **Reset Token**, puis colle-le dans `token.txt` (à côté de `start-bot.bat`). Ne le partage jamais : s'il fuite, reset-le.
   - Coche **SERVER MEMBERS INTENT**, puis Save.
2. **L'inviter** : onglet **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`,
   permission **Administrator** → ouvre l'URL générée → choisis ton serveur.
3. **Le lancer** : installe Python (https://www.python.org/downloads/, coche « Add to PATH »),
   puis double-clique sur `start-bot.bat`. Le serveur se construit tout seul.

Optionnel : mets une image `icon.png` à côté de `setup.py` pour l'icône du serveur.

## Ce qu'il crée

| Rôles | `👑 CEO` · `🛠️ Admin` · `⚙️ head of clipping` (staff) · `🟡 Apprentis` · `🆕 Nouveau` · `👥 Test` · `👋 Arrivant` (auto à l'arrivée) |
| --- | --- |
| **Objectifs 2026** | compteurs vues / clics / clippers (vocaux verrouillés, mis à jour avec `/stats`) — visibles de tous |
| **Welcome** | `start-here` (parcours + règles), `candidature` (bouton Postuler) — visibles de tous |
| **Nom du serveur** | `rémunération` — rôle Test et au-dessus |
| **Formation** | `faire-test` (bouton du bot Lune Tracker), forum `tutos`, vocal `coaching` — Test et au-dessus |
| **Clippers** | `général`, `comptes` (suivi des vues), vocal `call` — Nouveau et au-dessus |
| **test / Tickets** | salons privés créés automatiquement (candidat + staff) |
| **Staff** | `candidatures-staff`, `départs`, `logs` — staff uniquement |

**Parcours** : arrivée (rôle Arrivant + DM) → **Postuler** → ticket privé + formulaire → réponse dans `#candidatures-staff`
→ **Accepter** = rôle Test → clip test dans `#faire-test` (bot Lune Tracker) → validé = rôle Nouveau.
Sans formulaire, le candidat est relancé dans son ticket après 30 min puis 24 h.

Commandes (admins) : `/setup` pour réparer le serveur, `/stats vues:5,7M clics:12k clippers:28` pour les compteurs.

## Bon à savoir

- **Personnaliser** : nom, couleurs, rôles, salons et textes sont en haut de `setup.py` (section CHARTE).
- **Le rôle du bot doit rester tout en haut** (Paramètres du serveur → Rôles), sinon il ne peut pas donner les rôles.
- **Tester les permissions avec un 2e compte** : le compte propriétaire voit tout, il ne prouve rien.
- **Onboarding Discord** : si tu l'actives, ajoute TOUS les salons publics aux « salons par défaut », sinon les nouveaux ne les voient pas.
- **Sondage de départ** : Discord bloque souvent les DM à quelqu'un qui a quitté le serveur ; le départ est quand même toujours loggé dans `#départs`.
- Sans SERVER MEMBERS INTENT : `set MEMBERS=0` avant de lancer (pas d'accueil ni de sondage de départ, le reste marche).
