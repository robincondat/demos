# Convolution de deux signaux

Ouvrir `tds/convolution/` depuis le même serveur HTTP que les autres démos.
Le calcul tourne dans un Web Worker avec Pyodide, NumPy et SciPy, chargés
depuis le CDN déjà utilisé par Fourier.

Chaque section accepte un seul signal, défini par une équation ou importé
en WAV. Supprimer sa carte pour changer de source. L'éditeur reprend les
fonctions, paramètres, définitions par cas, périodicité et aides de Fourier.

Les fréquences d'échantillonnage doivent être identiques. Les intervalles
sont demi-ouverts `[début, fin[`. Le calcul est une convolution **discrète**,
sans multiplication par le pas temporel. Le début de l'axe de la convolution
complète est la somme des débuts des deux signaux.

Les modes suivent [NumPy `convolve`](https://numpy.org/doc/stable/reference/generated/numpy.convolve.html) :

- `full` : `N + M - 1` échantillons ;
- `same` : `max(N, M)` échantillons, centrés dans le résultat complet ;
- `valid` : `|N - M| + 1` échantillons, correspondant aux recouvrements complets.

Le moteur utilise [SciPy `signal.convolve`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.convolve.html)
avec `method='auto'`. Les tableaux sont ordonnés par longueur pour conserver
la convention NumPy de `same`, même quand la réponse impulsionnelle est plus
longue que le signal. Les axes de `same` et `valid` sont découpés avec les valeurs.

Vérification numérique (NumPy et SciPy requis) :

```sh
python -B -m unittest discover -s tds/convolution/tests
```
