export const convolutionDescriptions = {
  full: "Convolution complète : N + M − 1 échantillons. Tous les recouvrements sont conservés, avec un prolongement par zéro aux extrémités.",
  same: "Partie centrale de la convolution complète : max(N, M) échantillons, comme np.convolve. Les effets de bord restent présents.",
  valid:
    "Uniquement les recouvrements complets du signal le plus court dans le plus long : |N − M| + 1 échantillons, sans contribution du prolongement par zéro.",
};
