import { SPACES } from './colors.js?v=20261106-science1';

export const ORIGINAL_VIEW_GROUPS = [
  { label: 'Image', options: [['rgb', 'RGB']] },
  { label: 'Composantes en couleur', options: [['r', 'R'], ['g', 'G'], ['b', 'B']] },
  { label: 'Composantes en gris', options: [['r-gray', 'R (gris)'], ['g-gray', 'G (gris)'], ['b-gray', 'B (gris)']] },
  { label: 'Nuage', options: [['cloud', 'RGB 3D']] },
];

export function resultViewGroups(space) {
  const config = SPACES[space];
  if (space === 'cmyk') return [
    { label: 'Composantes soustractives', options: config.views.filter(([value]) => !value.endsWith('-gray')) },
    { label: 'Composantes en gris', options: config.views.filter(([value]) => value.endsWith('-gray')).map(([value, label]) => [value, `${label.split(' — ')[0]} (gris)`]) },
  ];
  const groups = [
    { label: 'Image', options: config.views.filter(([value]) => value === 'stack') },
    { label: 'Composantes en gris', options: config.views.filter(([value]) => value !== 'stack').map(([value, label]) => [value, label.split(' — ')[0]]) },
  ];
  if (space === 'ycbcr') groups.push({ label: 'Reconstructions', options: [['reduced-rgb', 'Après réduction RGB'], ['reduced-chroma', 'Après réduction Cb/Cr']] });
  if (space === 'hsv') groups.push(
    { label: 'Nuages', options: [['cloud', 'HSV 3D'], ['cloud-top', 'HSV — Dessus']] },
    { label: 'Sélection HSV', options: [['mask', 'Masque de sélection'], ['selected', 'Pixels sélectionnés (RGB)']] },
  );
  return groups;
}

export function populateGroupedMenu(select, groups) {
  select.replaceChildren(...groups.map(({ label, options }) => {
    const group = document.createElement('optgroup'); group.label = label;
    group.append(...options.map(([value, text]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = text; option.title = `${label} : ${text}`; return option;
    }));
    return group;
  }));
}
