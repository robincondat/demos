# Organisation des plateformes

Le projet reste un site statique, servi depuis `docs/`. Les URL des plateformes
(`tds/fourier/`, `tim/couleurs/`, etc.) restent stables.

```text
shared/                 # Commun à plusieurs matières
  components/           # Header de cours
  styles/               # Base, thème et header
  tests/                # Vérifications transversales
tds/
  shared/
    scripts/            # Signaux, courbes Canvas, runtime worker et lecture WAV
    compute/            # Évaluation, FFT et convolution réutilisables (Python)
    styles/             # Présentation commune des plateformes TDS
    tests/              # Tests du socle TDS
  fourier/              # Interface, calculs et tests spécifiques
  convolution/
  correlation/
  signaux/              # Création et superposition temporelle sans FFT
  filtrage/             # Filtres idéaux par masque RFFT/IRFFT
tim/
  shared/
    compute/            # Modèle des images scientifiques et adaptations de buffers
    scripts/            # Chargement d'images, navigation et analyse
    styles/             # Visualiseurs d'images
  contours/
  filtrage/
  morphologie/
  couleurs/
  histogrammes/
  resolution/           # Échantillonnage spatial et réduction des niveaux/couleurs
  coins/                # Harris, Shi-Tomasi, étapes et affinage subpixel
```

Un composant reste au niveau le plus proche de ses utilisateurs. Un nouveau
composant spécifique n'est partagé que lorsqu'un besoin commun concret apparaît.
Les dossiers `tests/` ou `components/` d'une matière peuvent être ajoutés au besoin.

## Dépendances

- Une plateforme utilise ses propres modules, le partagé de sa matière et le global.
- Le partagé d'une matière peut utiliser le global, jamais une plateforme ni une autre matière.
- Le partagé global ne dépend d'aucune matière.
- Les calculs et choix pédagogiques spécifiques restent dans les plateformes.

Les calculs TDS sont exécutés dans des workers Pyodide (Python, NumPy et SciPy).
Les plateformes appellent les fonctions scientifiques partagées et définissent
leurs propres options et visualisations.
Les conventions scientifiques sont regroupées dans [tds/README.md](tds/README.md).

Le socle TIM représente une image par `width`, `height`, `channels`, `data`
(tableau typé), `colorSpace` et `range` (plage théorique facultative).
Les pixels scientifiques restent distincts du rendu noir/blanc du Canvas.
Les buffers sont empruntés par défaut ; l'adaptation depuis OpenCV copie les
pixels par défaut pour qu'ils restent valides après libération de la matrice.
Histogrammes utilise ce format. Les autres plateformes conservent pour l'instant
leurs matrices OpenCV, acceptées par l'analyse commune via un adaptateur.
Le chargement d'OpenCV.js est centralisé dans `tim/shared/scripts/opencv-runtime.js`,
avec une version fixée à 4.13.0. Filtrage, Contours et Morphologie le chargent au
démarrage ; Couleurs uniquement pour les conversions qui le nécessitent.
Histogrammes charge OpenCV uniquement pour CLAHE. Le chargeur partage une seule tentative
par page, traite les erreurs et permet de réessayer après un échec.
Les cinq plateformes utilisent le visualiseur configurable de `viewer.js`.
Le même calcul d'histogramme et le même rendu servent aux formats compacts et
agrandis ; le rendu gère aussi les valeurs au survol et les plages comme H (0–180).
Les informations et valeurs de pixels sont centralisées dans `image-information.js`.
Couleurs garde l'orchestration des vues 3D et la préférence de synchronisation ;
Morphologie conserve ses informations binaires et n'ajoute pas d'histogrammes.
Les opérations scientifiques TIM sont dans `tim/shared/compute/` : LUT et seuils,
filtres spatiaux, morphologie, contours, conversions et sélection de couleurs,
réduction/reconstruction. Les opérations natives prennent un runtime OpenCV
optionnel (par défaut le runtime chargé dans la page) et renvoient des matrices
dont l'appelant assure la libération. Les adaptateurs locaux ne gardent que les
entrées/sorties Canvas et les choix de présentation. Les conventions d'arrondi
existantes sont préservées, notamment la conversion en gris OpenCV en Morphologie.

Le contrôleur `tim/shared/scripts/image-application.js` orchestre les cinq
plateformes : décodage dans un Canvas temporaire, calculs temporisés, rendu,
état de traitement et erreurs. Un nouveau chargement invalide les anciens
résultats ; les conversions asynchrones vérifient leur validité avant publication.
Le rendu possède une file indépendante pour ne pas interrompre une conversion.
Les paramètres, messages et libérations de matrices restent dans les interfaces.
Les calculs TIM restent exécutés dans la page ; ce contrôleur n'introduit pas
de workers.

Les panneaux HTML TIM sont construits par `image-components.js`, à partir de
`template[data-tim-component]` placés dans chaque page. L'application appelle
`mountImageComponents()` avant de récupérer les éléments du DOM. Les emplacements
restent locaux ; les variantes configurent les libellés, les grands histogrammes,
la synchronisation et les contenus spécifiques (sélecteurs et nuages de points).
Les contenus des slots proviennent uniquement du HTML de la plateforme.
`display-controls.js` partage la validation et les plages d'affichage ;
`opencv-image.js` prépare les matrices et leur rendu en conservant les arrondis
OpenCV. Les matrices retournées appartiennent à l'appelant.
`image-actions.js` regroupe l'export PNG, le suivi du curseur et l'aperçu des bords.
Leurs styles sont regroupés dans `tim/shared/styles/image-viewer.css` ; les styles
locaux conservent les dispositions et composants propres à chaque démonstration.

La détection de coins est dans `tim/shared/compute/corners.js` : Harris et
Shi-Tomasi suivent la chaîne pédagogique du TP : Sobel normalisé, moyenne des
produits, score, seuillage, maxima locaux 3 × 3 puis sélection gloutonne par
distance euclidienne. Les filtrages utilisent OpenCV en double précision ;
le NMS conserve des étapes intermédiaires indépendantes de l’affinage.
Les cartes renvoyées possèdent leurs propres
buffers, après libération des matrices OpenCV. `corner-refinement.js` implémente
l'affinage par orthogonalité des gradients, absent du build OpenCV.js utilisé.

## Lancement local

Depuis `docs/`, servir les fichiers en HTTP, puis ouvrir la plateforme souhaitée :

```sh
python -m http.server 8000
```

Par exemple : `http://localhost:8000/tds/fourier/`.
Les bibliothèques CDN nécessitent un accès Internet lors de leur chargement.

## Versions des assets

Les versions des assets locaux TDS sont synchronisées à partir de
`tds/assets-version.json`. Après une modification destinée à être publiée,
exécuter `node tds/update-assets.mjs NOUVELLE_VERSION` depuis `docs/`.
Sans argument, le script réapplique la version enregistrée. Il n'ajoute aucune
étape de build au site statique et ne touche pas TIM ni aux versions des CDN.

## Vérifications

Depuis `docs/`, avec Node.js et Python (NumPy et SciPy pour les tests scientifiques) :

```sh
node --test shared/tests/*.test.mjs tds/shared/tests/*.test.mjs tds/convolution/tests/*.test.mjs tim/shared/tests/*.test.mjs tim/couleurs/tests/*.test.mjs
python -B -m unittest discover -s tds/shared/tests
python -B -m unittest discover -s tds/convolution/tests
```

Les tests transversaux vérifient les
chemins des pages, des imports JavaScript, des feuilles CSS et des workers.
