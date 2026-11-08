# Conventions des plateformes TDS

Les plateformes sont accessibles dans `signaux/`, `fourier/`, `convolution/`,
`correlation/` et `filtrage/`. Le lancement local, les tests et la mise à jour des
assets sont décrits dans [ARCHITECTURE.md](../ARCHITECTURE.md).

## Signaux et WAV

Les signaux sont définis par une équation ou un WAV. L'axe temporel est commun :
`début + indice / fe`, sur l'intervalle demi-ouvert `[début, fin[`.
Les références à des signaux précédents sont réévaluées sur l'axe du signal qui
les utilise et valent zéro hors de leur intervalle de définition.
Le Dirac discret a une hauteur de 1, indépendante de la fréquence d'échantillonnage.

Les WAV conservent leurs amplitudes natives : un PCM 16 bits reste à son échelle
entière, sans normalisation automatique. Les calculs utilisent des flottants
64 bits ; les canaux sont moyennés en mono après conversion en flottants.
La fréquence native reste distincte de celle demandée par l'utilisateur.
L'évaluation interpole linéairement les échantillons WAV et prolonge par zéro.

Convolution et Corrélation estiment la mémoire nécessaire aux entrées, à la sortie
complète et aux tampons. Au-delà de 512 Mio estimés, un avertissement permet de
continuer ou d'annuler. Cette estimation ne couvre pas toute la mémoire du navigateur.

## Fourier

La FFT est bilatérale et centrée. La RFFT ne conserve que les fréquences positives
et la fréquence nulle. Les amplitudes sont divisées par le nombre N d'échantillons.
Pour la RFFT, elles sont ensuite doublées, sauf à 0 Hz et à Nyquist (`fe/2`) lorsque
N est pair. La résolution fréquentielle vaut `fe/N` et les phases sont en radians.

## Convolution et corrélation

Les entrées A et B doivent avoir la même fréquence d'échantillonnage.
Par défaut, les sorties sont des sommes discrètes. La case de normalisation par
le pas temporel multiplie uniquement la sortie par `Δt = 1/fe`.

| Mode | Convolution | Corrélation |
|---|---|---|
| `full` | N + M − 1 échantillons | N + M − 1 échantillons |
| `same` | max(N, M), convention NumPy | N, longueur de A, convention SciPy |
| `valid` | \|N − M\| + 1 échantillons | \|N − M\| + 1 échantillons |

Les modes réduits découpent les valeurs et leur axe ensemble. L'origine de la
convolution complète est `début_A + début_B`.

La corrélation suit `R_AB[k] = somme_j A[j] B[j − k]`. Un retard positif déplace
B vers la droite, sans retournement. L'axe physique des retards inclut
`début_A − début_B`. En convolution, B est retourné avant le glissement.

## ZNCC

À chaque retard, une fenêtre de A de la taille de B est centrée et normalisée
avec le pattern B. Les scores sont bornés à [−1, 1] ; une fenêtre ou un pattern
sans variance donne zéro. La multiplication par Δt est ignorée en ZNCC.

Pour `full` et `same`, les échantillons manquants de A sont remplacés par zéro
et participent au calcul des moyennes et des énergies. La taille de fenêtre reste
constante. Si B est plus long que A, cette convention s'applique aussi à `valid`.
Des scores élevés aux bords sont donc possibles avec un recouvrement partiel.

L'inspection reste celle de la corrélation classique : signaux bruts et aire du
produit brut. Elle illustre le recouvrement, mais son aire ne donne pas directement
le score ZNCC.

## Filtrage idéal

Le filtre est un masque binaire construit sur la grille RFFT du signal. Il multiplie
les coefficients complexes, puis l'IRFFT reconstruit exactement N échantillons,
y compris lorsque N est impair.

- Passe-bas : `f ≤ fc` ; passe-haut : `f ≥ fc`.
- Passe-bande : `f_basse ≤ f ≤ f_haute`.
- Coupe-bande : complément du passe-bande, bornes comprises dans la bande rejetée.

Les coupures sont en Hz, entre 0 et `fe/2`. Les masques passe-bande et coupe-bande
exigent deux coupures strictement ordonnées. H(f) est affiché sur le même axe
d'amplitude que les spectres, avec des valeurs 0 ou 1.

Le filtrage s'applique au bloc complet, périodisé implicitement par la DFT, sans
fenêtrage ni prolongement supplémentaire. Des oscillations aux discontinuités sont
donc possibles.
