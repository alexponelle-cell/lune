# NOCTA — boutique dropshipping (thème sombre)

Ouvrir `store/index.html` dans un navigateur : la boutique fonctionne sans serveur
(catalogue, filtres, fiche produit, panier avec barre de livraison offerte).

## 1. Les produits qui marchent le mieux en ce moment (sept. 2026)

Critères retenus : effet « wow » en vidéo (TikTok/Reels), résout un problème,
peu fragile, prix d'achat < 25 €, possibilité de vendre ×3 à ×4.

| Produit | Catégorie | Coût estimé* | Prix de vente | Marge brute |
|---|---|---|---|---|
| Masque LED 7 couleurs | Beauté | 22 € | 89 € | ~67 € |
| Station de charge magnétique 3-en-1 | Tech | 11 € | 49 € | ~38 € |
| Diffuseur nuage de pluie | Maison | 12 € | 44 € | ~32 € |
| Traducteur vocal IA | Tech | 19 € | 69 € | ~50 € |
| Sac à dos anti-vol USB | Voyage | 14 € | 59 € | ~45 € |
| Projecteur galaxie & aurores | Maison | 10 € | 42 € | ~32 € |
| Mini pistolet de massage | Bien-être | 13 € | 54 € | ~41 € |
| Mini hachoir électrique | Cuisine | 6 € | 29 € | ~23 € |
| Lampe coucher de soleil | Maison | 8 € | 34 € | ~26 € |
| Correcteur de posture intelligent | Bien-être | 9 € | 39 € | ~30 € |
| Gourde autonettoyante UV-C | Bien-être | 12 € | 45 € | ~33 € |
| Brosse vapeur pour animaux | Animaux | 7 € | 32 € | ~25 € |

\* Coûts indicatifs (produit + livraison, fournisseurs type CJ Dropshipping / AutoDS / Zendrop).
À vérifier sur votre fournisseur avant de lancer. La marge brute ne compte ni la pub
(en général 30–40 % du prix de vente) ni les frais de paiement (~3 %).

**Par où commencer** : lancez 2–3 produits en test (masque LED, station 3-en-1,
diffuseur nuage), avec 20–30 €/jour de pub chacun pendant 3–5 jours, puis gardez celui
qui a le meilleur coût par achat.

## 2. Palette (tokens dans `styles.css`)

| Rôle | Token | Couleur |
|---|---|---|
| Fond | `--bg` | `#0A0A0C` |
| Surface (cartes, footer) | `--surface` | `#121215` |
| Surface élevée | `--surface-2` / `--surface-3` | `#1A1A1F` / `#232329` |
| Bordure | `--border` / `--border-strong` | `#2A2A31` / `#3A3A43` |
| Texte | `--text` | `#F4F4F6` |
| Texte secondaire | `--text-soft` / `--muted` | `#C9C9D1` / `#8E8E99` |
| Accent (boutons, prix clés) | `--accent` | `#D4B679` (champagne) |
| Succès / promo | `--success` | `#4CC38A` |
| Erreur | `--danger` | `#F2555A` |

Règle : un seul accent. Le champagne est réservé aux actions (CTA, badges, compteur panier).

## 3. Passer sur Shopify

1. Créer la boutique Shopify, installer le thème gratuit **Dawn**.
2. *Personnaliser → Paramètres du thème → Couleurs* : créer un schéma
   « Sombre » avec : Arrière-plan `#0A0A0C`, Texte `#F4F4F6`,
   Bouton plein `#D4B679`, Libellé du bouton `#0A0A0C`, Bouton contour `#F4F4F6`,
   Ombre `#000000`. L'appliquer à toutes les sections.
3. *Typographie* : Inter (titres en gras 700–800).
4. Installer une appli fournisseur (DSers, CJ Dropshipping ou AutoDS), importer les
   produits ci-dessus, et reprendre titres, points forts et prix de `products.js`.
5. Reproduire la structure de la page : bandeau annonce → hero → réassurance →
   grille produits → produit phare → avis → FAQ → newsletter.
6. Remplacer les illustrations par de vraies photos produit sur fond sombre
   (fond `#121215`, format carré 1:1).

À faire avant de lancer : mentions légales, CGV, politique de retour (obligatoires
en France/UE), et remplacer les avis d'exemple par de vrais avis clients
(les avis et chiffres affichés dans la démo sont des exemples).
