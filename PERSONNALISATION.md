# Personnaliser le site

Le site est une application statique sans compilation. Les fichiers publiables
se trouvent dans `dist/`.

## Modifier l'apparence

Les styles communs sont répartis dans `dist/shared/styles/` :

- `theme.css` : couleurs, dimensions visuelles et finitions du thème clair ;
- `base.css` : structure générale, formulaires et composants communs ;
- `image-viewer.css` : zoom, déplacement, plages d'affichage et analyse ;
- `course-header.css` : en-tête commun.

Les adaptations propres au filtrage se trouvent dans
`dist/demos/filtrage/styles/filtrage.css`. Ce fichier est chargé après les
styles communs et peut donc les surcharger.

Pour changer la palette, modifier en priorité les variables situées au début de
`theme.css` :

```css
:root {
  --color-background: #f4f7fb;
  --color-panel: #ffffff;
  --color-border: #d8e1ec;
  --color-text: #12233f;
  --color-primary: #087ee6;
}
```

Le header est généré par le composant
`dist/shared/components/course-header.js`. Son contenu se configure
directement dans la page :

```html
<course-header
  page-title="Filtrage"
  course-code="TIM"
  course-name="Traitement d’Images"
  instructor="Robin Condat"
></course-header>
```

Pour une nouvelle page, il suffit généralement de changer
`page-title`. La largeur du panneau latéral est réglée dans
`.workspace-layout`.

## Modifier la structure

Le contenu de la démonstration se trouve dans
`dist/demos/filtrage/index.html`. Les grandes zones y sont délimitées par des
commentaires :

- chargement et export ;
- comparaison des images ;
- réglages d'affichage ;
- analyse ;
- paramètres du filtre ;
- éditeur du noyau.

Les identifiants des contrôles sont centralisés dans
`dist/demos/filtrage/scripts/ui.js`. Si un identifiant HTML change, mettre à
jour sa référence dans ce fichier.

## Modifier le comportement

Les scripts propres au filtrage sont dans
`dist/demos/filtrage/scripts/` :

- `app.js` : orchestration et événements de l'interface ;
- `ui.js` : références vers les éléments HTML ;
- `filters.js` : application des filtres OpenCV ;
- `kernel.js` : édition du noyau de convolution.

Les modules réutilisables sont dans `dist/shared/scripts/` :

- `image-loaders.js` : décodage des formats d'image ;
- `viewer.js` : zoom et déplacement synchronisés ;
- `analysis.js` : informations, valeurs sous le curseur et histogrammes.

Une démonstration peut importer uniquement les modules dont elle a besoin.

## Tester localement

Il faut servir le dossier `dist` avec un serveur HTTP ; ouvrir directement
`index.html` en `file://` peut empêcher le chargement des modules.

Par exemple, depuis la racine du projet :

```bash
python -m http.server 8000 --directory dist
```

Puis ouvrir <http://localhost:8000>.

Une connexion Internet reste nécessaire pour charger OpenCV.js et le décodeur
TIFF.
