# Architecture des démonstrateurs TIM

L'organisation distingue les éléments éprouvés comme communs des éléments
propres à une démonstration. Elle ne cherche pas à imposer un composant unique
qui contiendrait toutes les fonctionnalités possibles.

## Principe de composition

Chaque démonstrateur possède sa propre page, son contrôleur et ses réglages. Il
choisit les briques communes qu'il utilise :

- le header commun ;
- le chargement des images ;
- la visionneuse synchronisée ;
- le panneau d'analyse et les histogrammes ;
- le thème et les composants visuels généraux.

Une fonctionnalité absente n'a pas besoin d'un indicateur global : la page
n'ajoute simplement pas son HTML et son contrôleur n'importe pas son module.
Une variante peut surcharger les styles communs dans sa propre feuille CSS.

## Ajouter un démonstrateur

Créer un dossier dans le répertoire du cours concerné (`tim/`, `tds/` ou `auto/`) :

```text
docs/tim/nom-demo/
├── index.html
├── styles/
│   └── nom-demo.css
└── scripts/
    ├── app.js
    └── ui.js
```

La page charge d'abord les styles communs, puis sa feuille spécifique :

```html
<link rel="stylesheet" href="../../shared/styles/base.css" />
<link rel="stylesheet" href="../../shared/styles/image-viewer.css" />
<link rel="stylesheet" href="../../shared/styles/theme.css" />
<link rel="stylesheet" href="../../shared/styles/course-header.css" />
<link rel="stylesheet" href="./styles/nom-demo.css" />
```

Elle configure ensuite son en-tête :

```html
<course-header page-title="Nouveau titre"></course-header>
<script type="module" src="../../shared/components/course-header.js"></script>
```

Les attributs `course-code`, `course-name` et `instructor` sont
facultatifs et possèdent des valeurs par défaut.

## Ajouter ou retirer des fonctionnalités

Les modules partagés sont indépendants. Par exemple :

```js
import { drawFileToCanvas } from "../../../shared/scripts/image-loaders.js";
import { createSyncedViewer } from "../../../shared/scripts/viewer.js";
```

Un démonstrateur sans histogrammes n'importe pas `analysis.js` et n'inclut
pas la section d'analyse dans son HTML. À l'inverse, une démonstration peut
ajouter ses propres modules sans modifier `shared/`.

## Règle d'évolution

Une fonctionnalité ne doit être déplacée dans `shared/` que lorsqu'au moins
deux démonstrateurs l'utilisent avec une interface suffisamment proche. Les
variantes spécifiques restent dans le dossier de la démonstration afin
d'éviter un composant partagé rempli d'options rarement utilisées.
