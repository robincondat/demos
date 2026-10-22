# Convolution de deux signaux

Ouvrir `tds/convolution/` depuis le serveur HTTP des autres démos.
Le calcul tourne dans un Web Worker avec Pyodide, NumPy et SciPy.

Chaque section, **Signal A** et **Signal B**, accepte un seul signal :
une équation ou un WAV. Supprimer sa carte pour changer de source.
L'éditeur reprend les paramètres, définitions par cas, périodicité et aides de Fourier.

Les fréquences d'échantillonnage doivent être identiques et les intervalles
sont demi-ouverts `[début, fin[`. Le calcul est une convolution **discrète**,
sans multiplication par le pas temporel par défaut. La case « Normaliser par
le pas d'échantillonnage (Δt) » multiplie uniquement la sortie par `Δt = 1/fe`
dans les trois modes ; les deux signaux d'entrée restent inchangés.
Le début de l'axe de la convolution
complète est la somme des débuts des deux signaux.

Les modes suivent [NumPy convolve](https://numpy.org/doc/stable/reference/generated/numpy.convolve.html) :

- `full` : `N + M - 1` échantillons ;
- `same` : `max(N, M)` échantillons, centrés dans le résultat complet ;
- `valid` : `|N - M| + 1` échantillons, correspondant aux recouvrements complets.

Le moteur utilise [SciPy signal.convolve](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.convolve.html)
avec `method='auto'`. Les tableaux sont ordonnés par longueur pour conserver
la convention NumPy de `same`, même si B est plus long que A.
Les axes de `same` et `valid` sont découpés avec les valeurs.

Le premier graphique superpose A et B. Le résultat apparaît en dessous.
Un panneau replié par défaut, tout en bas, affiche A(τ), B(t − τ) et l'aire
colorée du produit : positive en vert, négative en rouge. Le survol du résultat
pilote le décalage, même lorsque ce panneau est fermé. Le survol de la
visualisation pilote également l'animation et le repère du résultat :
les deux repères sont calés au même instant.

Les deux vues du bas partagent le zoom et le déplacement horizontal.
Leur domaine temporel correspond aux échantillons du résultat dans le mode choisi.
L'échelle verticale de la visualisation suit les amplitudes de A et B.
Un double clic recentre les deux vues ; le graphique des entrées reste indépendant.
Une ligne verticale pointillée repère la position de la souris au survol de chaque vue du bas.

Vérifications (NumPy et SciPy requis pour Python) :

```sh
python -B -m unittest discover -s tds/convolution/tests
node --test tds/convolution/tests/inspector.test.mjs tds/convolution/tests/charts.test.mjs
```
