# Démonstrateurs TIM

Applications web statiques basées sur OpenCV.js. Elles permettent de charger une image locale et d’explorer le filtrage ainsi que l’extraction de gradients et de contours.

Formats acceptés : JPEG, PNG, WebP, BMP, TIFF/TIF, PBM, PGM et PPM. Les TIFF multipages sont ouverts sur leur première page. Les formats TIFF et Netpbm sont décodés dans un canevas intermédiaire avant leur conversion vers le format de travail.

Les deux vues disposent d’une navigation synchronisée : ajustement automatique à 100 %, zoom de 10 % à 4 000 % centré sur le pointeur avec la molette, déplacement par glisser-déposer et retour à 100 % par double-clic ou bouton.

Pour les calculs, le canal alpha est supprimé. Une image dont les canaux R, G et B sont identiques est traitée en niveaux de gris (`CV_32FC1`) ; les autres sont traitées en RGB (`CV_32FC3`). L’image originale et le résultat disposent chacun de leur propre plage noire/blanche, fixée par défaut à `[0, 255]`. Une normalisation min–max peut aussi adapter automatiquement chaque affichage aux extrema de l’image concernée, sans modifier les matrices `float32` utilisées pour les calculs.

L’interface d’analyse présente les dimensions, le type et la dynamique de l’image, les valeurs originales et filtrées sous le curseur, ainsi que les histogrammes avant et après traitement. Pour une image RGB, les trois canaux sont superposés ; pour une image en niveaux de gris, un histogramme unique est affiché. Les histogrammes sont calculés sur les données après écrêtage à la plage d’affichage : les valeurs extérieures alimentent donc les classes extrêmes. Une classe est créée par valeur entière jusqu’à 4096 classes ; les plages plus étendues sont regroupées en 4096 intervalles réguliers. Les valeurs sous le curseur restent celles de la matrice `float32`, avant normalisation visuelle.

Pour la convolution personnalisée, la taille du noyau et ses coefficients sont édités dans une fenêtre modale. Chaque cellule accepte les nombres entiers, décimaux et négatifs. Les flèches et la touche Entrée permettent de naviguer entre les cellules, et un bloc tabulé copié depuis un tableur peut être collé directement dans la matrice. Les commandes d’identité et de normalisation restent disponibles dans cette fenêtre.

## Utilisation locale

Servez le dossier `dist` avec un serveur HTTP local, puis ouvrez
`demos/filtrage/`. La racine redirige actuellement vers cette première
démonstration. Le démonstrateur `demos/contours/` présente les opérateurs de
gradient, les passages par zéro, Canny et le tracé des contours. Une connexion Internet est nécessaire au premier chargement pour
récupérer OpenCV.js depuis la documentation officielle.

## Déploiement

Le contenu de `dist` peut être publié tel quel sur GitHub Pages ou Vercel.

## Organisation du code

```text
dist/
├── index.html
├── shared/
│   ├── components/
│   │   └── course-header.js
│   ├── styles/
│   │   ├── base.css
│   │   ├── course-header.css
│   │   ├── image-viewer.css
│   │   └── theme.css
│   └── scripts/
│       ├── image-loaders.js
│       ├── viewer.js
│       └── analysis.js
└── demos/
    └── filtrage/
        ├── index.html
        ├── styles/
        │   └── filtrage.css
        └── scripts/
            ├── app.js
            ├── ui.js
            ├── filters.js
            └── kernel.js
```

Le fichier [PERSONNALISATION.md](PERSONNALISATION.md) indique précisément où
modifier les couleurs, le header, le panneau latéral et le comportement des
différents composants.

Le fichier [ARCHITECTURE.md](ARCHITECTURE.md) explique comment ajouter un
nouveau démonstrateur, réutiliser seulement certains modules et surcharger un
composant commun.
