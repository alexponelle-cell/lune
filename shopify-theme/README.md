# Thème Shopify NOCTA

Le design de la maquette NOCTA (`store/`) transformé en vrai thème Shopify :
panier coulissant branché sur votre boutique, fiches produit avec variantes,
thème clair par défaut + bouton sombre, et chaque texte modifiable dans l'éditeur.

## 1. Installer le thème (5 min)

1. Téléchargez **`nocta-theme.zip`** (à la racine du dépôt).
2. Shopify → **Boutique en ligne → Thèmes → Ajouter un thème → Importer un fichier zip**.
3. Choisissez `nocta-theme.zip`, attendez l'import, puis **Personnaliser** pour vérifier.
4. Quand tout vous plaît : **Actions → Publier**.

## 2. Régler le thème pour qu'il marche comme la maquette

| À faire dans Shopify | Pourquoi |
|---|---|
| Dans chaque fiche produit, remplissez **Type de produit** : `Beauté`, `Tech`, `Maison`… | Donne la couleur de la carte et crée les filtres |
| Ajoutez un **tag** `Best-seller`, `Viral`, `Nouveau` ou `Tendance` | Affiche le badge coloré sur la carte |
| Mettez un **prix barré** (champ « Prix avant réduction ») | Affiche le badge `-40%` et l'économie |
| Activez le **suivi de stock** sur les variantes | Affiche « Plus que N en stock » (vrai stock uniquement) |
| **Réductions → Réduction automatique** : 15 % dès 2 articles | La remise que la jauge du panier annonce |
| **Paramètres → Expédition** : tarif gratuit dès 60 € | La livraison offerte que la jauge annonce |
| **Navigation** : menus `main-menu` (en-tête) et `footer` (pied de page) | Liens du site |
| **Pages** : créez « Contact » avec le modèle `contact` | Formulaire de contact |

## 3. Personnaliser (Boutique en ligne → Thèmes → Personnaliser)

- **Paramètres du thème → Couleurs** : clair ou sombre par défaut, couleurs des boutons,
  couleur de chaque catégorie (`Beauté=#F472B6`, une par ligne).
- **Paramètres du thème → Panier** : seuil de livraison offerte, remise (N articles, %),
  panier coulissant ou page panier.
- **Page d'accueil** : bannière (produit mis en avant + 2 cartes flottantes), bandeau
  défilant, grille de produits, produit phare, avantages, avis, FAQ, newsletter.
  Chaque section se déplace, se masque ou se duplique.
- **Bandeau d'annonce** : texte + compte à rebours (date de fin réelle, au format
  `2026-10-05T23:59:59`). Il disparaît tout seul à la fin.

## 4. Les avis clients

Les étoiles des cartes et des fiches viennent automatiquement d'une appli d'avis
(**Judge.me**, **Loox** ou **Shopify Product Reviews**) : rien ne s'affiche tant qu'un
produit n'a pas d'avis. La section « Avis clients » de l'accueil est vide par défaut :
ajoutez-y uniquement de vrais avis.

## Contenu du thème

```
layout/     theme.liquid (page), password.liquid (boutique fermée)
sections/   hero, marquee, featured-collection, product-highlight, perks, reviews,
            faq, newsletter, announcement-bar, header, footer, main-* (pages)
snippets/   product-card, price, rating, category-color, cart-drawer, icon, meta-tags
assets/     nocta.css (design), nocta.js (panier Ajax, variantes, filtres, timer, thème)
templates/  index, product, collection, cart, page, page.contact, search, blog,
            article, list-collections, 404, password, gift_card
```

Vérifié avec `shopify theme check` : 0 erreur (seuls avertissements : la police Inter
est chargée depuis Google Fonts). Les pages de compte client utilisent les
« nouveaux comptes clients » de Shopify (réglage par défaut).
