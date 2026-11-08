function operations(cv) {
  function kernelValues(colors, hitmiss) {
    return colors.map((color) => (color === "white" ? 1 : hitmiss && color === "black" ? -1 : 0));
  }

  function structuringColors(shape, width, height) {
    // Le diamant a été ajouté récemment à OpenCV. Les anciennes versions de
    // son moteur JS utilisent le même masque défini par distance de Manhattan.
    if (shape === "diamond" && cv.MORPH_DIAMOND === undefined) {
      const r = Math.floor(height / 2),
        c = Math.floor(width / 2);
      return Array.from({ length: width * height }, (_, index) =>
        Math.abs((index % width) - c) + Math.abs(Math.floor(index / width) - r) <= r
          ? "white"
          : "black",
      );
    }
    const shapes = {
      rectangle: cv.MORPH_RECT,
      cross: cv.MORPH_CROSS,
      ellipse: cv.MORPH_ELLIPSE,
      diamond: cv.MORPH_DIAMOND,
    };
    const element = cv.getStructuringElement(shapes[shape], new cv.Size(width, height));
    // Les zéros des formes usuelles représentent le fond noir exigé en
    // Hit or Miss. Le gris indifférent reste réservé au masque personnalisé.
    try {
      return Array.from(element.data, (value) => (value ? "white" : "black"));
    } finally {
      element.delete();
    }
  }

  function applyMorphology(src, settings) {
    const hitmiss = settings.operation === "hitmiss";
    const kernel = cv.matFromArray(
      settings.height,
      settings.width,
      hitmiss ? cv.CV_32SC1 : cv.CV_8UC1,
      kernelValues(settings.colors, hitmiss),
    );
    const dst = new cv.Mat();
    const operations = {
      erode: cv.MORPH_ERODE,
      dilate: cv.MORPH_DILATE,
      open: cv.MORPH_OPEN,
      close: cv.MORPH_CLOSE,
      gradient: cv.MORPH_GRADIENT,
      tophat: cv.MORPH_TOPHAT,
      blackhat: cv.MORPH_BLACKHAT,
      hitmiss: cv.MORPH_HITMISS,
    };
    const borders = {
      constant: cv.BORDER_CONSTANT,
      replicate: cv.BORDER_REPLICATE,
      reflect: cv.BORDER_REFLECT,
      reflect101: cv.BORDER_REFLECT_101,
    };
    try {
      const args = [
        src,
        dst,
        operations[settings.operation],
        kernel,
        new cv.Point(-1, -1),
        1,
        settings.border === "neutral" ? cv.BORDER_CONSTANT : borders[settings.border],
      ];
      // Argument omis : bord neutre OpenCV, adapté à chaque opération élémentaire.
      if (settings.border !== "neutral") args.push(new cv.Scalar(settings.borderValue));
      cv.morphologyEx(...args);
      return dst;
    } catch (error) {
      dst.delete();
      throw error;
    } finally {
      kernel.delete();
    }
  }

  return { kernelValues, structuringColors, applyMorphology };
}

export function kernelValues(colors, hitmiss, runtime = globalThis.cv) {
  return operations(runtime).kernelValues(colors, hitmiss);
}

export function structuringColors(shape, width, height, runtime = globalThis.cv) {
  return operations(runtime).structuringColors(shape, width, height);
}

export function applyMorphology(src, settings, runtime = globalThis.cv) {
  return operations(runtime).applyMorphology(src, settings);
}
