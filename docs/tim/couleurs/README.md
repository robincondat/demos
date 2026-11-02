# Espaces de couleurs — TIM

Ouvrir `tim/couleurs/` avec le serveur HTTP utilisé par les autres démos.
Le lecteur d'images, le header, les styles et le zoom/déplacement synchronisés
sont repris des composants communs TIM. Les conversions du TP restent en
JavaScript ; Lab, HLS et XYZ utilisent OpenCV.js 4.13.0, chargé à la demande
depuis le site officiel. Les résultats sont mis en cache pour l'image courante.

À gauche : RGB, R/G/B en couleur (les deux autres composantes mises à zéro),
R/G/B bruts en niveaux de gris, ou le nuage RGB 3D.
À droite, le menu dépend de l'espace choisi :

- CMYK : C, M, Y et K sur fond blanc, ou leurs valeurs brutes en niveaux de gris ;
- YCbCr : canaux empilés, Y, Cb et Cr en niveaux de gris, ou deux reconstructions comparatives ;
- HSV : canaux empilés, H, S et V en niveaux de gris, nuage HSV 3D ou vue de dessus dans le disque.
- Lab : canaux empilés et composantes L*, a* et b* en niveaux de gris ;
- HLS : canaux empilés et composantes H, L et S en niveaux de gris ;
- XYZ : canaux empilés et composantes X, Y et Z en niveaux de gris.

Ces trois ajouts utilisent `COLOR_RGB2Lab`, `COLOR_RGB2HLS` et `COLOR_RGB2XYZ`
après conversion de l'entrée RGBA en RGB. Les canaux sont codés en uint8 :
Lab affiche donc L* ramené sur [0,255], et a*/b* décalés de 128.
Il s'agit des codes OpenCV, pas des valeurs physiques Lab flottantes.
H dans HLS utilise une plage d'affichage de [0,180], comme dans HSV ;
les autres canaux sont affichés sur [0,255]. Les canaux XYZ sont les valeurs
8 bits produites directement par OpenCV, avec écrêtage à cette plage.

La case « Navigation synchronisée », cochée par défaut, peut être désactivée
avec deux images. Les deux cadrages deviennent indépendants et les contrôles
de zoom agissent sur l'image manipulée en dernier. Réactiver la case aligne
l'autre image sur ce cadrage. Le passage en 3D décoche la case et la rend
indisponible tant qu'un nuage est affiché ; le retour à deux images restaure
automatiquement le choix précédent, activé ou désactivé. Les vues 3D ont leur
navigation Plotly indépendante. Aucun libellé ne remplace le pourcentage
lorsqu'aucune image ne peut être pilotée par la barre de zoom.

Plotly est chargé à la demande depuis son CDN (version figée 4.1.1).
Les nuages reprennent les coordonnées du notebook : RGB dans [0,255]³ ;
HSV avec `x=V*S*cos(H)`, `y=V*S*sin(H)`, `z=V`, S et V normalisés.
La conversion HSV est celle de la plateforme, fondée sur les formules du TP ;
les arrondis peuvent différer légèrement de `cv2.cvtColor` dans le notebook.
Les points gardent leur couleur RGB et une opacité de 0.9 ; leur taille est
de 2 dans les vues 3D et de 4 dans la vue de dessus.
Les représentants de couleurs sont déterministes et communs aux nuages,
avec un plafond automatique de 50 000 points par image. On recense d'abord
les couleurs RGB distinctes et leurs effectifs : sous le plafond, chaque couleur
est affichée une fois, quelle que soit sa fréquence. Au-delà, une grille RGB
regroupe les couleurs proches, avec une résolution diminuée jusqu'à respecter
le plafond. Chaque cellule garde la couleur réellement présente la plus proche
de sa moyenne. Les effectifs sont conservés par le recensement mais n'affectent
ni la taille ni l'opacité des points. Aucun réglage de densité n'est exposé.
Des couleurs RGB différentes peuvent encore se superposer après quantification
HSV ou projection de dessus ; les pixels sombres ramenés au centre du disque
dans la vue du TP constituent notamment un tel cas.
La vue de dessus reprend `x=V*S*cos(H)`, `y=V*S*sin(H)` avec un cercle unitaire
et des axes de même échelle. Comme dans le TP, les pixels V < 100 sont ramenés
au centre, en conservant leurs couleurs RGB. Elle dispose de son propre zoom 2D.
L'orientation est conservée lorsqu'on revient à un nuage de la même image.
L'export PNG du résultat est désactivé lorsque la vue de droite est un nuage.

## Sélection de couleurs HSV

Le panneau latéral HSV propose des seuils min/max inclusifs : H sur [0,180],
S et V sur [0,255]. Si H min > H max, l'intervalle traverse l'origine :
`H >= min ou H <= max`. Cela permet de sélectionner les rouges comme dans
le TP (`H = 130..10`, S et V au moins 40). S et V exigent min <= max.
Une sélection pleine plage est utilisée par défaut et un bouton la rétablit.

Le masque est appliqué à tous les pixels avant le recensement des couleurs.
Les nuages RGB, HSV 3D et HSV de dessus partagent donc uniquement les mêmes
couleurs retenues. Les vues d'image RGB originale et des composantes restent
disponibles ; les vues HSV « Pixels sélectionnés (RGB) » et « Masque de
sélection » montrent respectivement les couleurs retenues sur fond noir et
le masque binaire. Aucun changement de teinte n'est appliqué à cette étape.

Les formules suivent le TDM6 fourni :

- CMYK simplifié : `K = 255 − max(R,G,B)`, `C = max − R`, `M = max − G`, `Y = max − B`.
  Les vues d'encre soustraient leur composante au blanc. Il ne s'agit pas d'une
  conversion CMYK avec profil d'impression ICC.
- YCbCr : coefficients `0.299 / 0.587 / 0.114`, chrominances centrées sur `0.5`,
  facteurs `0.564` et `0.713`, écrêtage puis troncature uint8. Ordre Y–Cb–Cr.
- HSV : teinte divisée par deux et arrondie sur [0,180], S et V sur [0,255].
  La vue H utilise par défaut une plage d'affichage de [0,180].

Les canaux empilés sont affichés directement comme les composantes d'un écran RGB :
ce sont des fausses couleurs, pas une reconversion vers l'image originale.
Les plages d'affichage sont fixées aux limites théoriques : [0,255] pour les
images et composantes, sauf H en niveaux de gris (HSV et HLS) qui utilise [0,180].
Il n'y a plus de réglage manuel ni de normalisation min–max.
La navigation occupe une barre pleine largeur sous les visualiseurs. Les
informations, valeurs au curseur et histogrammes sont répartis dans trois
blocs adaptatifs en dessous. Le masque est l'avant-dernière vue HSV et les
pixels sélectionnés RGB restent en dernière position.
Les valeurs au curseur indiquent les coordonnées RGB et les coordonnées dans l'espace choisi ;
l'écart RGB compare les deux vues rendues. Les histogrammes suivent la vue sélectionnée.
L'export PNG sauvegarde la vue de droite telle qu'affichée.

## Sous-échantillonnage et reconstruction YCbCr

Deux vues supplémentaires comparent le traitement du TP, sans réglage :

- « Reconstruction après réduction RGB » : réduction des trois canaux RGB ;
- « Reconstruction après réduction Cb/Cr » : conversion YCbCr, réduction des
  chrominances seulement, conservation exacte de Y, puis retour en RGB.

La réduction utilise une moyenne surfacique vers `ceil(w/2) × ceil(h/2)`.
La reconstruction est bilinéaire et reprend les dimensions d'origine.
Les valeurs intermédiaires sont quantifiées en uint8 comme dans le TP ;
les arrondis JavaScript peuvent différer d'une unité des interpolations
optimisées d'OpenCV. Le calcul est mis en cache pour chaque image chargée.
Les pixels au curseur, histogrammes et export suivent l'image reconstruite.

Il s'agit d'une illustration du sous-échantillonnage, pas d'un encodeur JPEG.
Les 6 et 12 bits/pixel théoriques du TP concernent les tableaux réduits avec
des dimensions paires, et non le poids du PNG reconstruit exporté.

Tests :

```sh
node --test tim/couleurs/tests/*.test.mjs
```
