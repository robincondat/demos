const RETRIEVAL = {
  external: () => cv.RETR_EXTERNAL,
  list: () => cv.RETR_LIST,
  ccomp: () => cv.RETR_CCOMP,
  tree: () => cv.RETR_TREE,
};
const APPROXIMATION = {
  simple: () => cv.CHAIN_APPROX_SIMPLE,
  none: () => cv.CHAIN_APPROX_NONE,
  tc89l1: () => cv.CHAIN_APPROX_TC89_L1,
  tc89kcos: () => cv.CHAIN_APPROX_TC89_KCOS,
};

function normalized8U(src) {
  const dst = new cv.Mat();
  cv.normalize(src, dst, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
  return dst;
}

function gaussian(src, size, sigma) {
  if (size === 1) return src.clone();
  const dst = new cv.Mat();
  cv.GaussianBlur(src, dst, new cv.Size(size, size), sigma, sigma, cv.BORDER_REFLECT_101);
  return dst;
}

function outer(a, b) {
  return a.flatMap((rowValue) =>
    b.map((columnValue) => rowValue * columnValue),
  );
}

function gaussianKernel(size, sigma) {
  const radius = Math.floor(size / 2),
    values = [];
  let sum = 0;
  for (let y = -radius; y <= radius; y++)
    for (let x = -radius; x <= radius; x++) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      values.push(value);
      sum += value;
    }
  return values.map((value) => value / sum);
}

function laplacianKernel(size, connectivity) {
  const radius = Math.floor(size / 2),
    values = new Array(size * size).fill(0);
  if (connectivity === 4) {
    for (let offset = -radius; offset <= radius; offset++) {
      if (offset === 0) continue;
      values[radius * size + radius + offset] = 1;
      values[(radius + offset) * size + radius] = 1;
    }
  } else {
    values.fill(1);
    values[radius * size + radius] = 0;
  }
  values[radius * size + radius] = -values.reduce((sum, value) => sum + value, 0);
  return values;
}

export function kernelsFor(settings) {
  if (settings.method === "sobel" || settings.method === "prewitt") {
    const size = settings.derivativeSize,
      sobel = {
        3: { smooth: [1, 2, 1], derivative: [-1, 0, 1] },
        5: { smooth: [1, 4, 6, 4, 1], derivative: [-1, -2, 0, 2, 1] },
        7: {
          smooth: [1, 6, 15, 20, 15, 6, 1],
          derivative: [-1, -4, -5, 0, 5, 4, 1],
        },
      },
      vectors =
        settings.method === "sobel"
          ? sobel[size]
          : {
              smooth: new Array(size).fill(1),
              derivative: Array.from({ length: size }, (_, index) =>
                index < Math.floor(size / 2)
                  ? -1
                  : index > Math.floor(size / 2)
                    ? 1
                    : 0,
              ),
            };
    return [
      {
        label: "Dérivée X",
        size,
        values: outer(vectors.smooth, vectors.derivative),
      },
      {
        label: "Dérivée Y",
        size,
        values: outer(vectors.derivative, vectors.smooth),
      },
    ];
  }
  if (settings.method === "laplacian")
    return [
      {
        label: `Laplacien ${settings.laplacianConnectivity}-connexe`,
        size: settings.laplacianSize,
        values: laplacianKernel(
          settings.laplacianSize,
          settings.laplacianConnectivity,
        ),
      },
    ];
  if (settings.method === "dog") {
    const first = gaussianKernel(settings.dogSize, settings.dogSigma1),
      second = gaussianKernel(settings.dogSize, settings.dogSigma2);
    return [
      {
        label: `Gaussien σ₁ = ${settings.dogSigma1}`,
        size: settings.dogSize,
        values: first,
      },
      {
        label: `Gaussien σ₂ = ${settings.dogSigma2}`,
        size: settings.dogSize,
        values: second,
      },
      {
        label: "Différence Gσ₁ − Gσ₂",
        size: settings.dogSize,
        values: first.map((value, index) => value - second[index]),
      },
    ];
  }
  return [];
}

function filterWithKernel(src, kernel) {
  const kernelMat = cv.matFromArray(
      kernel.size,
      kernel.size,
      cv.CV_32FC1,
      kernel.values,
    ),
    dst = new cv.Mat();
  try {
    cv.filter2D(
      src,
      dst,
      cv.CV_32F,
      kernelMat,
      new cv.Point(-1, -1),
      0,
      cv.BORDER_REFLECT_101,
    );
    return dst;
  } finally {
    kernelMat.delete();
  }
}

function magnitudeAndOrientation(dx, dy) {
  const amplitude = new cv.Mat(), theta = new cv.Mat();
  cv.cartToPolar(dx, dy, amplitude, theta, false);
  return { amplitude, theta };
}

// Transposition de visualiser_orientation du TP : l'angle pilote la teinte et
// l'amplitude normalisée pilote la luminosité. La sortie 8 bits facilite son
// affichage dans le navigateur tout en conservant la même représentation HSV.
function orientationRgb(amplitude, theta) {
  const amplitude8 = normalized8U(amplitude), hsv = new cv.Mat(amplitude.rows, amplitude.cols, cv.CV_8UC3);
  const h = theta.data32F, v = amplitude8.data, pixels = hsv.data;
  for (let i = 0; i < h.length; i++) {
    const signedAngle = h[i] > Math.PI ? h[i] - 2 * Math.PI : h[i];
    pixels[i * 3] = Math.round(((signedAngle + Math.PI) / (2 * Math.PI)) * 179);
    pixels[i * 3 + 1] = 255;
    pixels[i * 3 + 2] = v[i];
  }
  const rgb8 = new cv.Mat(), rgb32 = new cv.Mat();
  cv.cvtColor(hsv, rgb8, cv.COLOR_HSV2RGB);
  rgb8.convertTo(rgb32, cv.CV_32F);
  amplitude8.delete(); hsv.delete(); rgb8.delete();
  return rgb32;
}

function thresholdAmplitude(amplitude, threshold) {
  const normalized = normalized8U(amplitude), binary = new cv.Mat();
  cv.threshold(normalized, binary, threshold, 255, cv.THRESH_BINARY);
  normalized.delete();
  return binary;
}

// Version simplifiée fournie dans le TP : min/max sur une fenêtre 3 × 3.
function zeroCrossingSimple(src, minThreshold, maxThreshold, differenceThreshold) {
  const dst = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1), input = src.data32F, output = dst.data;
  const value = (y, x) => y < 0 || x < 0 || y >= src.rows || x >= src.cols ? 0 : input[y * src.cols + x];
  for (let y = 0; y < src.rows; y++) for (let x = 0; x < src.cols; x++) {
    let min = Infinity, max = -Infinity;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      const current = value(yy, xx); min = Math.min(min, current); max = Math.max(max, current);
    }
    output[y * src.cols + x] = min < minThreshold && max > maxThreshold && max - min > differenceThreshold ? 255 : 0;
  }
  return dst;
}

// Version avancée fournie dans le TP : comparaison des quatre paires de
// voisins opposés autour du pixel central.
function zeroCrossingAdvanced(src, differenceThreshold) {
  const dst = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1), input = src.data32F, output = dst.data;
  const value = (y, x) => y < 0 || x < 0 || y >= src.rows || x >= src.cols ? 0 : input[y * src.cols + x];
  const pairs = [[0, 1, 0, -1], [-1, 0, 1, 0], [-1, 1, 1, -1], [-1, -1, 1, 1]];
  for (let y = 0; y < src.rows; y++) for (let x = 0; x < src.cols; x++) {
    output[y * src.cols + x] = pairs.some(([ay, ax, by, bx]) => {
      const a = value(y + ay, x + ax), b = value(y + by, x + bx);
      return a * b <= 0 && Math.abs(a - b) > differenceThreshold;
    }) ? 255 : 0;
  }
  return dst;
}

function drawDetectedContours(sourceRgb, binary, settings) {
  const contours = new cv.MatVector(), hierarchy = new cv.Mat(), mask = binary.clone(), rgb8 = new cv.Mat(), drawn = new cv.Mat();
  try {
    cv.findContours(mask, contours, hierarchy, RETRIEVAL[settings.retrievalMode](), APPROXIMATION[settings.approximationMode]());
    sourceRgb.convertTo(rgb8, cv.CV_8U);
    if (settings.drawContours) cv.drawContours(rgb8, contours, -1, new cv.Scalar(255, 0, 0, 255), 1, cv.LINE_8, hierarchy, 100);
    rgb8.convertTo(drawn, cv.CV_32F);
    return { image: drawn, count: contours.size() };
  } finally {
    contours.delete(); hierarchy.delete(); mask.delete(); rgb8.delete();
  }
}

export function runPipeline(gray, sourceRgb, settings) {
  const images = new Map(), add = (key, label, mat, mode = "Grayscale") => images.set(key, { key, label, mat, mode });
  let smoothed, dx, dy, amplitude, theta, response, binary;
  try {
    smoothed = settings.gaussianEnabled ? gaussian(gray, settings.gaussianSize, settings.gaussianSigma) : gray.clone();
    add("preprocessed", "Image prétraitée", smoothed.clone());

    if (settings.method === "sobel" || settings.method === "prewitt") {
      const [kernelX, kernelY] = kernelsFor(settings);
      dx = filterWithKernel(smoothed, kernelX);
      dy = filterWithKernel(smoothed, kernelY);
      ({ amplitude, theta } = magnitudeAndOrientation(dx, dy));
      add("dx", "Dérivée directionnelle ∂I/∂x", dx.clone());
      add("dy", "Dérivée directionnelle ∂I/∂y", dy.clone());
      add("amplitude", "Amplitude du gradient", amplitude.clone());
      add("orientation", "Orientation du gradient", orientationRgb(amplitude, theta), "RGB");
      binary = thresholdAmplitude(amplitude, settings.gradientThreshold);
    } else if (settings.method === "laplacian") {
      response = filterWithKernel(smoothed, kernelsFor(settings)[0]);
      add("response", "Réponse du Laplacien", response.clone());
      binary = settings.zeroCrossingMode === "simple" ? zeroCrossingSimple(response, settings.zeroThresholdMin, settings.zeroThresholdMax, settings.zeroThresholdDifference) : zeroCrossingAdvanced(response, settings.zeroThresholdDifference);
    } else if (settings.method === "dog") {
      const [kernelFirst, kernelSecond] = kernelsFor(settings),
        first = filterWithKernel(smoothed, kernelFirst),
        second = filterWithKernel(smoothed, kernelSecond);
      response = new cv.Mat(); cv.subtract(first, second, response); first.delete(); second.delete();
      add("response", "Réponse de la DoG", response.clone());
      binary = settings.zeroCrossingMode === "simple" ? zeroCrossingSimple(response, settings.zeroThresholdMin, settings.zeroThresholdMax, settings.zeroThresholdDifference) : zeroCrossingAdvanced(response, settings.zeroThresholdDifference);
    } else {
      const input8 = new cv.Mat(); smoothed.convertTo(input8, cv.CV_8U); binary = new cv.Mat();
      cv.Canny(input8, binary, settings.cannyLow, settings.cannyHigh, settings.cannyAperture, settings.cannyL2); input8.delete();
    }
    const binary32 = new cv.Mat(); binary.convertTo(binary32, cv.CV_32F); add("binary", "Contours binaires", binary32);
    const detection = drawDetectedContours(sourceRgb, binary, settings); add("contours", "Contours détectés", detection.image, "RGB");
    return { images, contourCount: detection.count };
  } finally {
    smoothed?.delete(); dx?.delete(); dy?.delete(); amplitude?.delete(); theta?.delete(); response?.delete(); binary?.delete();
  }
}

export function deletePipeline(result) { result?.images.forEach(({ mat }) => mat.delete()); }
