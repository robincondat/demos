import { drawFileToCanvas } from '../../../shared/scripts/image-loaders.js';
import { createImageViewer } from './image-viewer.js?v=20261102-clouds1';
import { SPACES, convertRGB, originalView, convertedView, displayPixels } from './colors.js?v=20261103-gray1';
import { OPENCV_SPACES, loadColorRuntime, convertWithOpenCV } from './opencv-colors.js?v=20261103-gray1';
import { createCloudView, selectColorRepresentatives, cloudTrace } from './clouds.js?v=20261102-selection1';
import { ALL_HSV, selectHSV, selectionView } from './hsv-selection.js?v=20261102-selection1';
import { reconstructionView } from './reconstruction.js?v=20261102-reconstruction1';
import { ORIGINAL_VIEW_GROUPS, resultViewGroups, populateGroupedMenu } from './view-menus.js?v=20261103-menus1';

const $ = id => document.getElementById(id);
const kinds = ['original', 'result'];
const isCloud = kind => ['cloud', 'cloud-top'].includes($(`${kind}View`).value);
let active = 'original', sourceVersion = 0, indices = null;
let syncPreference = true, navigationHadCloud = false;
const traceCache = new Map();
const reconstructionCache = new Map();
const conversionCache = new Map();
let conversionVersion = 0;
const clouds = Object.fromEntries(kinds.map(kind => [kind, createCloudView($(`${kind}Cloud`))]));
const viewers = Object.fromEntries(kinds.map(kind => [kind, createImageViewer({
  stages: [$(`${kind}Stage`)], canvases: [$(`${kind}Canvas`)],
  zoomLabel: document.createElement('output'), zoomSlider: document.createElement('input'), fitButton: document.createElement('button'),
  enabled: () => !isCloud(kind),
  onActivate: () => { active = kind; updateToolbar(); },
  onViewChange: view => { active = kind; if ($('syncNavigation').checked) viewers[kind === 'original' ? 'result' : 'original'].setView(view); updateToolbar(); },
})]));
let source = null, converted = null, left = null, right = null, displayed = {}, currentFile = null, loadVersion = 0;
let renderFrame = null;
let hsvSource = null, selectionMask = null, selectionKey = '';
const space = () => document.querySelector('input[name="space"]:checked').value;

function refreshSelection() {
  $('hsvSelection').hidden = space() !== 'hsv';
  if (!source) return true;
  let key = `${sourceVersion}:all`, mask = null;
  if (space() === 'hsv') {
    const bounds = Object.fromEntries(Object.keys(ALL_HSV).map(name => [name, Number.parseFloat($(name).value)]));
    key = `${sourceVersion}:${JSON.stringify(bounds)}`;
    if (key === selectionKey) { $('selectionError').textContent = ''; return true; }
    try {
      hsvSource ||= convertRGB(source.data, 'hsv');
      ({ mask } = selectHSV(hsvSource.data, bounds));
      $('selectionError').textContent = '';
    } catch (error) { $('selectionError').textContent = error.message; $('downloadButton').disabled = true; return false; }
  }
  if (key !== selectionKey) { selectionKey = key; selectionMask = mask; indices = null; traceCache.clear(); }
  return true;
}

function updateToolbar() {
  if (isCloud(active)) active = kinds.find(kind => !isCloud(kind)) || active;
  const available = Boolean(source) && !isCloud(active);
  $('zoomSlider').disabled = $('fitView').disabled = !available;
  $('navigationTitle').textContent = $('syncNavigation').checked ? 'Navigation' : `Navigation · ${active === 'original' ? 'gauche' : 'droite'}`;
  if (available) {
    const { zoom } = viewers[active].getView();
    $('zoomLabel').textContent = `${Math.round(zoom * 100)} %`;
    $('zoomSlider').value = Math.round(Math.log(zoom / 0.1) / Math.log(400) * 1000);
  } else $('zoomLabel').textContent = '';
}

function updateNavigation() {
  const anyCloud = kinds.some(isCloud);
  $('syncNavigation').checked = !anyCloud && syncPreference;
  if (!anyCloud && navigationHadCloud && syncPreference) viewers[active === 'original' ? 'result' : 'original'].setView(viewers[active].getView());
  navigationHadCloud = anyCloud;
  $('syncNavigation').disabled = anyCloud;
  $('syncNavigation').title = anyCloud ? 'Les nuages 3D utilisent leur navigation propre.' : 'Lier le zoom et le déplacement des deux images.';
  for (const kind of kinds) {
    const cloud = isCloud(kind);
    $(`${kind}Canvas`).hidden = cloud;
    $(`${kind}Stage`).classList.toggle('has-cloud', cloud);
    if (!cloud) clouds[kind].hide();
  }
  updateToolbar();
}

function drawCloud(kind) {
  const mode = kind === 'original' ? 'rgb' : $('resultView').value === 'cloud-top' ? 'hsv-top' : 'hsv';
  if (!indices) indices = selectColorRepresentatives(source.data, undefined, selectionMask).indices;
  const key = `${selectionKey}:${mode}`;
  const pixels = source.data, selectedIndices = indices;
  clouds[kind].show(key, mode, () => {
    if (!traceCache.has(key)) traceCache.set(key, cloudTrace(pixels, selectedIndices, mode));
    return traceCache.get(key);
  }, `${sourceVersion}:${mode}`);
}

function populateViews() {
  $('hsvSelection').hidden = space() !== 'hsv';
  const config = SPACES[space()];
  populateGroupedMenu($('resultView'), resultViewGroups(space()));
  $('resultView').title = space() === 'cmyk' ? 'Composantes soustraites au blanc, selon les formules du TP.' : 'Canaux empilés : valeurs des trois canaux affichées directement comme R, G et B, en fausses couleurs.';
  $('resultTitle').textContent = `Image ${config.name}`;
}

function clearCursor() {
  for (const id of ['cursorPosition', 'cursorOriginal', 'cursorResult', 'cursorDifference']) $(id).textContent = '—';
}

function drawHistogram(kind, view, resolved) {
  const canvas = $(`${kind}Histogram`), width = Math.max(220, Math.round(canvas.clientWidth * (devicePixelRatio || 1))), height = 120;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), bins = Math.min(256, Math.max(1, Math.ceil(resolved.max - resolved.min + 1)));
  const histograms = Array.from({ length: view.channels }, () => new Uint32Array(bins));
  for (let i = 0; i < view.data.length; i++) {
    const bin = Math.max(0, Math.min(bins - 1, Math.floor((view.data[i] - resolved.min) / (resolved.max - resolved.min || 1) * (bins - 1))));
    histograms[i % view.channels][bin]++;
  }
  let peak = 1;
  for (const values of histograms) for (const value of values) peak = Math.max(peak, value);
  const palette = view.channels === 1 ? ['#52667f'] : ['#e34b5f', '#20a56b', '#187ddd'];
  histograms.forEach((values, c) => {
    ctx.beginPath(); ctx.strokeStyle = palette[c]; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
    values.forEach((value, i) => { const x = bins === 1 ? width / 2 : i * (width - 1) / (bins - 1), y = height - 2 - value / peak * (height - 6); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  $(`${kind}HistogramRange`).textContent = `${view.labels.join(' / ')} · [${resolved.min}, ${resolved.max}]`;
}

function renderView(kind, view) {
  try {
    const pixels = displayPixels(view, { min: 0, max: view.max ?? 255, auto: false });
    const canvas = $(`${kind}Canvas`); canvas.width = source.width; canvas.height = source.height;
    canvas.getContext('2d').putImageData(new ImageData(pixels.rgba, source.width, source.height), 0, 0);
    displayed[kind] = pixels.rgba;
    drawHistogram(kind, view, pixels);
    return true;
  } catch (failure) { $('conversionError').textContent = failure.message; return false; }
}

function render() {
  renderFrame = null;
  updateNavigation();
  if (!refreshSelection()) return;
  if (!source || !converted || converted.space !== space()) return;
  left = originalView(source.data, isCloud('original') ? 'rgb' : $('originalView').value);
  const resultView = $('resultView').value;
  if (resultView.startsWith('reduced-')) {
    if (!reconstructionCache.has(resultView)) reconstructionCache.set(resultView, reconstructionView(source.data, source.width, source.height, resultView));
    right = reconstructionCache.get(resultView);
  } else right = ['selected', 'mask'].includes(resultView) ? selectionView(source.data, selectionMask, resultView === 'mask') : convertedView(converted, isCloud('result') ? 'stack' : resultView);
  if (isCloud('original')) { drawCloud('original'); drawHistogram('original', left, { min: 0, max: 255 }); }
  else renderView('original', left);
  let b = false;
  if (isCloud('result')) { drawCloud('result'); drawHistogram('result', right, { min: 0, max: 255 }); }
  else b = renderView('result', right);
  $('downloadButton').disabled = isCloud('result') || !b;
  $('infoType').textContent = `RGB uint8 → ${SPACES[space()].name} uint8`;
  clearCursor();
}

function schedule() { if (renderFrame === null) renderFrame = requestAnimationFrame(render); }

async function convert() {
  const version = ++conversionVersion, target = space(), image = source;
  $('conversionError').textContent = '';
  if (!source) return;
  $('downloadButton').disabled = true; $('processing').hidden = false;
  try {
    let next;
    if (OPENCV_SPACES[target]) {
      if (!conversionCache.has(target)) {
        const { runtime } = await loadColorRuntime();
        if (version !== conversionVersion || image !== source) return;
        const value = convertWithOpenCV(image, target, runtime); value.labels = SPACES[target].labels; conversionCache.set(target, value);
      }
      next = conversionCache.get(target);
    } else next = convertRGB(image.data, target);
    if (version !== conversionVersion || image !== source) return;
    converted = next; schedule();
  } catch (error) { if (version === conversionVersion) $('conversionError').textContent = error.message; }
  finally { if (version === conversionVersion) $('processing').hidden = true; }
}

async function loadImage(file) {
  const version = ++loadVersion;
  $('imageMeta').textContent = 'Décodage de l’image…';
  try {
    const temporary = document.createElement('canvas'), decoded = await drawFileToCanvas(file, temporary);
    if (version !== loadVersion) return;
    const pixels = temporary.getContext('2d').getImageData(0, 0, decoded.width, decoded.height);
    source = pixels; currentFile = file; displayed = {}; sourceVersion++; indices = null; traceCache.clear(); reconstructionCache.clear(); conversionCache.clear(); hsvSource = null; selectionKey = ''; converted = null;
    $('sourceCanvas').width = pixels.width; $('sourceCanvas').height = pixels.height;
    $('sourceCanvas').getContext('2d').putImageData(pixels, 0, 0);
    $('fileName').textContent = file.name;
    $('imageMeta').textContent = `${pixels.width} × ${pixels.height} px · ${decoded.format}${decoded.detail || ''} · RGB`;
    $('infoDimensions').textContent = `${pixels.width} × ${pixels.height} px`;
    $('infoFileSize').textContent = file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} Ko` : `${(file.size / 1048576).toFixed(1)} Mo`;
    let min = 255, max = 0;
    for (let i = 0; i < pixels.data.length; i++) if (i % 4 !== 3) { min = Math.min(min, pixels.data[i]); max = Math.max(max, pixels.data[i]); }
    $('infoOriginalRange').textContent = `[${min}, ${max}]`;
    for (const kind of ['original', 'result']) $(`${kind}Stage`).classList.remove('empty');
    for (const kind of kinds) viewers[kind].setImageSize(pixels.width, pixels.height);
    await convert();
  } catch (error) { if (version === loadVersion) { $('imageMeta').textContent = 'Chargement impossible'; $('conversionError').textContent = error.message; } }
}

$('imageInput').addEventListener('change', event => { const [file] = event.target.files; if (file) loadImage(file); });
$('originalView').addEventListener('change', () => { active = 'original'; updateNavigation(); schedule(); });
$('resultView').addEventListener('change', () => { active = 'result'; updateNavigation(); schedule(); });
$('syncNavigation').addEventListener('change', () => { syncPreference = $('syncNavigation').checked; if (syncPreference) viewers[active === 'original' ? 'result' : 'original'].setView(viewers[active].getView()); updateToolbar(); });
$('zoomSlider').addEventListener('input', () => viewers[active].setZoom(0.1 * Math.pow(400, Number($('zoomSlider').value) / 1000)));
$('fitView').addEventListener('click', () => viewers[active].fit());
document.querySelectorAll('input[name="space"]').forEach(input => input.addEventListener('change', () => { populateViews(); convert(); }));
for (const name of Object.keys(ALL_HSV)) $(name).addEventListener('input', schedule);
$('resetSelection').addEventListener('click', () => { for (const [name, value] of Object.entries(ALL_HSV)) $(name).value = value; selectionKey = ''; schedule(); });
for (const kind of ['original', 'result']) {
  $(`${kind}Stage`).addEventListener('pointermove', event => {
    if (!source || !converted || converted.space !== space() || isCloud(kind)) { clearCursor(); return; }
    const point = viewers[kind].toImagePoint($(`${kind}Stage`), event.clientX, event.clientY);
    if (!point) { clearCursor(); return; }
    const i = point.y * source.width + point.x, rgb = source.data.slice(i * 4, i * 4 + 3), base = i * converted.channels;
    $('cursorPosition').textContent = `x : ${point.x} · y : ${point.y}`;
    $('cursorOriginal').textContent = ['R', 'G', 'B'].map((label, c) => `${label} ${rgb[c]}`).join(' · ');
    $('cursorResult').textContent = $('resultView').value.startsWith('reduced-') ? right.labels.map((label, c) => `${label} ${right.data[i * 3 + c]}`).join(' · ') : converted.labels.map((label, c) => `${label} ${converted.data[base + c]}`).join(' · ');
    $('cursorDifference').textContent = !kinds.some(isCloud) && displayed.original && displayed.result ? ['R', 'G', 'B'].map((label, c) => `${label} ${displayed.result[i * 4 + c] - displayed.original[i * 4 + c]}`).join(' · ') : '—';
  });
  $(`${kind}Stage`).addEventListener('pointerleave', clearCursor);
}
$('resetButton').addEventListener('click', () => {
  document.querySelector('input[name="space"][value="cmyk"]').checked = true;
  $('originalView').value = 'rgb'; populateViews();
  syncPreference = true; $('syncNavigation').checked = true; indices = null; traceCache.clear();
  for (const [name, value] of Object.entries(ALL_HSV)) $(name).value = value;
  selectionKey = ''; selectionMask = null; $('selectionError').textContent = '';
  updateNavigation(); viewers[active === 'original' ? 'result' : 'original'].setView(viewers[active].getView()); convert();
});
$('downloadButton').addEventListener('click', () => {
  if (!source) return;
  const name = `${currentFile.name.replace(/\.[^.]+$/, '')}-${space()}-${$('resultView').value}.png`;
  $('resultCanvas').toBlob(blob => {
    if (!blob) return;
    const link = document.createElement('a'), url = URL.createObjectURL(blob); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});
populateGroupedMenu($('originalView'), ORIGINAL_VIEW_GROUPS);
populateViews();
updateNavigation();
new ResizeObserver(() => { if (source) schedule(); }).observe($('originalHistogram').parentElement);
