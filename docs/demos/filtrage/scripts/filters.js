const BORDER_MAP = {
  constant: () => cv.BORDER_CONSTANT,
  replicate: () => cv.BORDER_REPLICATE,
  reflect: () => cv.BORDER_REFLECT,
  reflect101: () => cv.BORDER_REFLECT_101,
};

function paddingFor(width, height) {
  return {
    left: Math.floor(width / 2),
    right: width - 1 - Math.floor(width / 2),
    top: Math.floor(height / 2),
    bottom: height - 1 - Math.floor(height / 2),
  };
}

function withPaddedSource(
  src,
  width,
  height,
  borderName,
  borderValue,
  operation,
) {
  const p = paddingFor(width, height),
    padded = new cv.Mat(),
    filtered = new cv.Mat();
  const scalar = new cv.Scalar(borderValue, borderValue, borderValue, 255);
  cv.copyMakeBorder(
    src,
    padded,
    p.top,
    p.bottom,
    p.left,
    p.right,
    BORDER_MAP[borderName](),
    scalar,
  );
  try {
    operation(padded, filtered);
    const roi = filtered.roi(new cv.Rect(p.left, p.top, src.cols, src.rows));
    try {
      return roi.clone();
    } finally {
      roi.delete();
    }
  } finally {
    padded.delete();
    filtered.delete();
  }
}

export function applyFilter(src, settings) {
  const {
    filter,
    width,
    height,
    borderType,
    borderValue,
    sigmaX,
    sigmaY,
    kernel,
  } = settings;
  if (filter === "mean")
    return withPaddedSource(
      src,
      width,
      height,
      borderType,
      borderValue,
      (a, b) =>
        cv.blur(
          a,
          b,
          new cv.Size(width, height),
          new cv.Point(-1, -1),
          cv.BORDER_CONSTANT,
        ),
    );
  if (filter === "median")
    return withPaddedSource(
      src,
      width,
      width,
      borderType,
      borderValue,
      (a, b) => {
        if (width <= 5) {
          cv.medianBlur(a, b, width);
          return;
        }
        // OpenCV limite medianBlur en float32 aux tailles 3 et 5. Comme l’image
        // source provient de pixels 8 bits et que la médiane sélectionne une valeur
        // existante, ce détour conserve exactement le résultat mathématique.
        const input8 = new cv.Mat(),
          output8 = new cv.Mat();
        try {
          a.convertTo(input8, cv.CV_8U);
          cv.medianBlur(input8, output8, width);
          output8.convertTo(b, cv.CV_32F);
        } finally {
          input8.delete();
          output8.delete();
        }
      },
    );
  if (filter === "gaussian")
    return withPaddedSource(
      src,
      width,
      height,
      borderType,
      borderValue,
      (a, b) =>
        cv.GaussianBlur(
          a,
          b,
          new cv.Size(width, height),
          sigmaX,
          sigmaY,
          cv.BORDER_CONSTANT,
        ),
    );
  const kernelMat = cv.matFromArray(height, width, cv.CV_32FC1, kernel);
  try {
    return withPaddedSource(
      src,
      width,
      height,
      borderType,
      borderValue,
      (a, b) =>
        cv.filter2D(
          a,
          b,
          -1,
          kernelMat,
          new cv.Point(-1, -1),
          0,
          cv.BORDER_CONSTANT,
        ),
    );
  } finally {
    kernelMat.delete();
  }
}
