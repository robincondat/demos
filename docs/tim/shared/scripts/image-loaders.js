const SUPPORTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "pbm",
  "pgm",
  "ppm",
]);

function extensionOf(name) {
  return name.toLowerCase().split(".").pop();
}
function scaleSample(value, maxValue) {
  return Math.round((value * 255) / maxValue);
}

function makeTokenReader(bytes) {
  let position = 0;
  const whitespace = (value) =>
    value === 9 || value === 10 || value === 13 || value === 32;
  function skip() {
    while (position < bytes.length) {
      if (whitespace(bytes[position])) {
        position++;
        continue;
      }
      if (bytes[position] === 35) {
        while (
          position < bytes.length &&
          bytes[position] !== 10 &&
          bytes[position] !== 13
        )
          position++;
        continue;
      }
      break;
    }
  }
  return {
    token() {
      skip();
      const start = position;
      while (
        position < bytes.length &&
        !whitespace(bytes[position]) &&
        bytes[position] !== 35
      )
        position++;
      if (start === position) throw new Error("En-tête Netpbm incomplet.");
      return new TextDecoder("ascii").decode(bytes.subarray(start, position));
    },
    binaryStart() {
      if (position >= bytes.length || !whitespace(bytes[position]))
        throw new Error("Séparateur Netpbm manquant.");
      if (bytes[position] === 13 && bytes[position + 1] === 10) position += 2;
      else position++;
      return position;
    },
  };
}

export function decodePnmBuffer(buffer) {
  const bytes = new Uint8Array(buffer),
    reader = makeTokenReader(bytes),
    magic = reader.token();
  if (!/^P[1-6]$/.test(magic))
    throw new Error("Signature PBM/PGM/PPM invalide.");
  const width = Number(reader.token()),
    height = Number(reader.token());
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("Dimensions Netpbm invalides.");
  const bitmap = magic === "P1" || magic === "P4",
    maxValue = bitmap ? 1 : Number(reader.token());
  if (
    !bitmap &&
    (!Number.isInteger(maxValue) || maxValue < 1 || maxValue > 65535)
  )
    throw new Error(
      "La valeur maximale Netpbm doit être comprise entre 1 et 65535.",
    );
  const rgba = new Uint8ClampedArray(width * height * 4),
    channels = magic === "P3" || magic === "P6" ? 3 : 1,
    ascii = magic === "P1" || magic === "P2" || magic === "P3";
  let samples;
  if (ascii) {
    samples = new Array(width * height * channels);
    for (let i = 0; i < samples.length; i++) {
      const value = Number(reader.token());
      if (!Number.isFinite(value))
        throw new Error("Données Netpbm incomplètes.");
      samples[i] = value;
    }
  } else {
    const start = reader.binaryStart();
    samples = new Array(width * height * channels);
    if (magic === "P4") {
      const rowBytes = Math.ceil(width / 8);
      if (bytes.length < start + rowBytes * height)
        throw new Error("Données PBM incomplètes.");
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          samples[y * width + x] =
            (bytes[start + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    } else {
      const bytesPerSample = maxValue < 256 ? 1 : 2,
        required = samples.length * bytesPerSample;
      if (bytes.length < start + required)
        throw new Error("Données Netpbm incomplètes.");
      for (let i = 0, p = start; i < samples.length; i++, p += bytesPerSample)
        samples[i] =
          bytesPerSample === 1 ? bytes[p] : (bytes[p] << 8) | bytes[p + 1];
    }
  }
  for (let pixel = 0; pixel < width * height; pixel++) {
    const out = pixel * 4;
    if (channels === 3) {
      rgba[out] = scaleSample(samples[pixel * 3], maxValue);
      rgba[out + 1] = scaleSample(samples[pixel * 3 + 1], maxValue);
      rgba[out + 2] = scaleSample(samples[pixel * 3 + 2], maxValue);
    } else {
      const gray = bitmap
        ? samples[pixel]
          ? 0
          : 255
        : scaleSample(samples[pixel], maxValue);
      rgba[out] = rgba[out + 1] = rgba[out + 2] = gray;
    }
    rgba[out + 3] = 255;
  }
  return { width, height, rgba, format: magic };
}

async function decodeTiff(file) {
  if (!globalThis.UTIF)
    throw new Error(
      "Le décodeur TIFF n’a pas pu être chargé. Vérifiez la connexion Internet.",
    );
  const buffer = await file.arrayBuffer(),
    pages = globalThis.UTIF.decode(buffer);
  if (!pages.length)
    throw new Error("Aucune image n’a été trouvée dans ce TIFF.");
  globalThis.UTIF.decodeImage(buffer, pages[0]);
  const rgba = globalThis.UTIF.toRGBA8(pages[0]);
  return {
    width: pages[0].width,
    height: pages[0].height,
    rgba: new Uint8ClampedArray(rgba),
    format: "TIFF",
    detail: pages.length > 1 ? ` · page 1/${pages.length}` : "",
  };
}

async function decodeBrowserImage(file) {
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(
          new Error("Le navigateur ne parvient pas à décoder cette image."),
        );
      image.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      image,
      format: extensionOf(file.name).toUpperCase(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function drawFileToCanvas(file, canvas) {
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension))
    throw new Error(
      "Format non pris en charge. Utilisez JPEG, PNG, WebP, BMP, TIFF, PBM, PGM ou PPM.",
    );
  let decoded;
  if (extension === "tif" || extension === "tiff")
    decoded = await decodeTiff(file);
  else if (["pbm", "pgm", "ppm"].includes(extension))
    decoded = decodePnmBuffer(await file.arrayBuffer());
  else decoded = await decodeBrowserImage(file);
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext("2d");
  if (decoded.image) context.drawImage(decoded.image, 0, 0);
  else
    context.putImageData(
      new ImageData(decoded.rgba, decoded.width, decoded.height),
      0,
      0,
    );
  return decoded;
}
