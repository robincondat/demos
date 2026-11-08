import { convertRGB } from "../../shared/compute/color-spaces.js?v=20261106-science1";


export const MAX_CLOUD_POINTS = 50000;

export function selectColorRepresentatives(rgba, limit = MAX_CLOUD_POINTS, mask = null) {
  if (!Number.isInteger(limit) || limit < 1) throw Error('Nombre de points invalide.');
  const packed = i => (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
  const exact = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (mask && !mask[i / 4]) continue;
    const key = packed(i), entry = exact.get(key);
    if (entry) entry.count++;
    else exact.set(key, { index: i / 4, count: 1 });
    if (exact.size > limit) break;
  }
  function result(groups, bits) {
    const keys = [...groups.keys()].sort((a, b) => a - b);
    return { indices: Uint32Array.from(keys, key => groups.get(key).index),
      occurrences: Uint32Array.from(keys, key => groups.get(key).count), bits };
  }
  if (exact.size <= limit) return result(exact, 8);
  exact.clear();

  // Mémoire bornée : chaque essai est abandonné dès que le plafond est dépassé.
  for (let bits = 7; bits >= 0; bits--) {
    const shift = 8 - bits;
    const bucket = i => ((rgba[i] >> shift) << (2 * bits)) | ((rgba[i + 1] >> shift) << bits) | (rgba[i + 2] >> shift);
    const groups = new Map();
    let overflow = false;
    for (let i = 0; i < rgba.length; i += 4) {
      if (mask && !mask[i / 4]) continue;
      const key = bucket(i); let entry = groups.get(key);
      if (!entry) { entry = { count: 0, r: 0, g: 0, b: 0, distance: Infinity, color: Infinity, index: 0 }; groups.set(key, entry); }
      entry.count++; entry.r += rgba[i]; entry.g += rgba[i + 1]; entry.b += rgba[i + 2];
      if (groups.size > limit) { overflow = true; break; }
    }
    if (overflow) continue;
    // Une vraie couleur de l'image, la plus proche de la moyenne de sa cellule.
    for (let i = 0; i < rgba.length; i += 4) {
      if (mask && !mask[i / 4]) continue;
      const entry = groups.get(bucket(i));
      const distance = (rgba[i] - entry.r / entry.count) ** 2 + (rgba[i + 1] - entry.g / entry.count) ** 2 + (rgba[i + 2] - entry.b / entry.count) ** 2;
      const color = packed(i);
      if (distance < entry.distance || (distance === entry.distance && color < entry.color)) {
        entry.index = i / 4; entry.distance = distance; entry.color = color;
      }
    }
    return result(groups, bits);
  }
}

export function cloudTrace(rgba, indices, mode = 'rgb') {
  const count = indices.length, pixels = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) pixels.set(rgba.subarray(indices[i] * 4, indices[i] * 4 + 4), i * 4);
  const hsv = mode.startsWith('hsv') ? convertRGB(pixels, 'hsv').data : null;
  const x = new Float32Array(count), y = new Float32Array(count), z = new Float32Array(count), colors = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 4, r = pixels[base], g = pixels[base + 1], b = pixels[base + 2];
    colors[i] = `rgb(${r},${g},${b})`;
    if (hsv) {
      const angle = hsv[i * 3] * 2 * Math.PI / 180, s = hsv[i * 3 + 1] / 255, v = hsv[i * 3 + 2] / 255;
      x[i] = v * s * Math.cos(angle); y[i] = v * s * Math.sin(angle); z[i] = v;
      // Vue de dessus du TP : les pixels V < 100 sont ramenés au centre.
      if (mode === 'hsv-top' && hsv[i * 3 + 2] < 100) x[i] = y[i] = 0;
    } else { x[i] = r; y[i] = g; z[i] = b; }
  }
  return { type: mode === 'hsv-top' ? 'scattergl' : 'scatter3d', mode: 'markers', x, y, ...(mode === 'hsv-top' ? {} : { z }), customdata: indices,
    marker: { size: mode === 'hsv-top' ? 4 : 2, opacity: 0.9, color: colors },
    hovertemplate: mode === 'rgb' ? 'Pixel %{customdata}<br>R %{x}<br>G %{y}<br>B %{z}<extra></extra>' : mode === 'hsv-top' ? 'Pixel %{customdata}<br>x %{x:.3f}<br>y %{y:.3f}<extra></extra>' : 'Pixel %{customdata}<br>x %{x:.3f}<br>y %{y:.3f}<br>V %{z:.3f}<extra></extra>' };
}

let plotlyPromise;
export function loadPlotly() {
  if (globalThis.Plotly) return Promise.resolve(globalThis.Plotly);
  if (!plotlyPromise) plotlyPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://cdn.plot.ly/plotly-4.1.1.min.js'; script.async = true;
    script.onload = () => globalThis.Plotly ? resolve(globalThis.Plotly) : reject(Error('Plotly indisponible.'));
    script.onerror = () => { script.remove(); plotlyPromise = null; reject(Error('Chargement 3D impossible. Vérifiez votre connexion puis sélectionnez de nouveau le nuage.')); };
    document.head.append(script);
  });
  return plotlyPromise;
}

export function cloudLayout(mode, revision) {
  if (mode === 'hsv-top') return { autosize: true, margin: { l: 38, r: 20, t: 20, b: 40 }, paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', showlegend: false, uirevision: revision,
    xaxis: { title: { text: 'V · S · cos(H)' }, range: [-1, 1], constrain: 'domain', zerolinecolor: '#dce3ec' },
    yaxis: { title: { text: 'V · S · sin(H)' }, range: [-1, 1], scaleanchor: 'x', scaleratio: 1, constrain: 'domain', zerolinecolor: '#dce3ec' },
    shapes: [{ type: 'circle', xref: 'x', yref: 'y', x0: -1, y0: -1, x1: 1, y1: 1, line: { color: '#52667f', width: 1 }, fillcolor: 'rgba(0,0,0,0)' }] };
  const axis = (title, range) => ({ title: { text: title }, range, autorange: false, backgroundcolor: '#f7f9fc', gridcolor: '#dce3ec', zerolinecolor: '#b7c5d6' });
  return { autosize: true, margin: { l: 0, r: 0, t: 15, b: 0 }, paper_bgcolor: '#ffffff', showlegend: false, uirevision: revision,
    scene: { aspectmode: 'cube', dragmode: 'orbit',
      xaxis: axis(mode === 'rgb' ? 'R' : 'V · S · cos(H)', mode === 'rgb' ? [0, 255] : [-1, 1]),
      yaxis: axis(mode === 'rgb' ? 'G' : 'V · S · sin(H)', mode === 'rgb' ? [0, 255] : [-1, 1]),
      zaxis: axis(mode === 'rgb' ? 'B' : 'V', mode === 'rgb' ? [0, 255] : [0, 1]) } };
}

export function createCloudView(host) {
  const plot = document.createElement('div'), status = document.createElement('div');
  plot.className = 'cloud-plot'; status.className = 'cloud-status'; status.setAttribute('role', 'status'); host.append(plot, status);
  let generation = 0, lastKey = null, serial = Promise.resolve();
  new ResizeObserver(() => { if (!host.hidden && lastKey && globalThis.Plotly) globalThis.Plotly.Plots.resize(plot); }).observe(host);
  return {
    hide() { generation++; host.hidden = true; },
    show(key, mode, getTrace, revision) {
      host.hidden = false; const ticket = ++generation;
      status.textContent = 'Chargement du nuage…'; status.hidden = false;
      serial = serial.catch(() => {}).then(async () => {
        const Plotly = await loadPlotly();
        if (ticket !== generation || host.hidden) return;
        if (lastKey !== key) {
          await Plotly.react(plot, [getTrace()], cloudLayout(mode, revision), { responsive: true, displaylogo: false, scrollZoom: true,
            modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d'] });
          lastKey = key;
        } else await Plotly.Plots.resize(plot);
        if (ticket === generation) status.hidden = true;
      }).catch(error => { if (ticket === generation && !host.hidden) { status.textContent = error.message; status.hidden = false; } });
    },
  };
}
