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

Base sombre + couleurs vives pour guider l'œil vers l'achat.

| Rôle | Token | Couleur |
|---|---|---|
| Fond | `--bg` | `#09090B` |
| Surfaces (cartes, footer) | `--surface` / `--surface-2` / `--surface-3` | `#111114` / `#18181D` / `#212128` |
| Bordures | `--border` / `--border-strong` | `#26262E` / `#363640` |
| Texte | `--text` / `--text-soft` / `--muted` | `#F5F5F7` / `#C8C8D2` / `#8B8B98` |
| **Boutons d'achat** | `--cta` | dégradé `#7C3AED` → `#DB2777` (texte blanc) |
| Titres / halos | `--grad` | dégradé `#A78BFA` → `#F472B6` → `#FB923C` |
| Promo / économies | `--success` | `#34D399` |
| Stock bas | `--orange` | `#FB923C` |

Une couleur par catégorie (`CATEGORY_COLORS` dans `products.js`) : Beauté `#F472B6`,
Tech `#22D3EE`, Maison `#A78BFA`, Voyage `#FB923C`, Bien-être `#34D399`,
Cuisine `#FBBF24`, Animaux `#A3E635`.

## Leviers de conversion intégrés

- **Ajout rapide** sur chaque carte (sans ouvrir la fiche).
- **-15 % dès 2 articles**, calculé dans le panier, avec jauge de progression.
- **Livraison offerte dès 60 €**, avec jauge.
- **Compte à rebours** de la promo de lancement (`STORE.saleEnds`), disparaît à la fin.
- **Stock bas** affiché sous 15 unités (`stock` dans `products.js`).
- Réglages centralisés dans l'objet `STORE` de `products.js`.

⚠️ En France/UE, le compte à rebours, les prix barrés et le stock doivent être réels
(prix barré = prix réellement pratiqué avant la promo). Ne relancez pas un faux
timer à chaque visite.

## 3. Passer sur Shopify

1. Créer la boutique Shopify, installer le thème gratuit **Dawn**.
2. *Personnaliser → Paramètres du thème → Couleurs* : créer un schéma
   « Sombre » avec : Arrière-plan `#09090B`, Texte `#F5F5F7`,
   Bouton plein `#DB2777`, Libellé du bouton `#FFFFFF`, Bouton contour `#F5F5F7`,
   Ombre `#000000`. L'appliquer à toutes les sections.
3. *Typographie* : Inter (titres en gras 700–800).
4. Installer une appli fournisseur (DSers, CJ Dropshipping ou AutoDS), importer les
   produits ci-dessus, et reprendre titres, points forts et prix de `products.js`.
5. Reproduire la structure de la page : bandeau annonce → hero → réassurance →
   grille produits → produit phare → avis → FAQ → newsletter.
6. Remplacer les illustrations par de vraies photos produit sur fond sombre
   (fond `#111114`, format carré 1:1).

À faire avant de lancer : mentions légales, CGV, politique de retour (obligatoires
en France/UE), et remplacer les avis d'exemple par de vrais avis clients
(les avis et chiffres affichés dans la démo sont des exemples).
