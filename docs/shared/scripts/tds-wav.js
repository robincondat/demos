const chunkName = (view, offset) =>
  String.fromCharCode(...new Uint8Array(view.buffer, offset, 4));
export function readWavMetadata(buffer) {
  const view = new DataView(buffer);
  if (
    view.byteLength < 44 ||
    chunkName(view, 0) !== "RIFF" ||
    chunkName(view, 8) !== "WAVE"
  )
    throw new Error("Ce fichier n’est pas un WAV RIFF valide.");
  let offset = 12, format = null, dataSize = null;
  while (offset + 8 <= view.byteLength) {
    const name = chunkName(view, offset),
      size = view.getUint32(offset + 4, true),
      content = offset + 8;
    if (content + size > view.byteLength)
      throw new Error("Le fichier WAV est tronqué.");
    if (name === "fmt " && size >= 16)
      format = {
        formatTag: view.getUint16(content, true),
        channels: view.getUint16(content + 2, true),
        bitsPerSample: view.getUint16(content + 14, true),
        sampleRate: view.getUint32(content + 4, true),
        blockAlign: view.getUint16(content + 12, true),
      };
    else if (name === "data") dataSize = size;
    offset = content + size + (size % 2);
  }
  if (!format || dataSize == null || !format.channels || !format.sampleRate || !format.blockAlign || dataSize % format.blockAlign !== 0)
    throw new Error("Les blocs fmt et data du WAV sont invalides.");
  return {
    sampleRate: format.sampleRate,
    duration: dataSize / format.blockAlign / format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    frameCount: dataSize / format.blockAlign,
    formatTag: format.formatTag,
  };
}
export async function decodeWav(file) {
  const buffer = await file.arrayBuffer(), metadata = readWavMetadata(buffer);
  return {
    ...metadata,
    wavBytes: new Uint8Array(buffer),
    wavName: file.name,
  };
}
