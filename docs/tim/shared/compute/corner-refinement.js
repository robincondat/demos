// Subpixel gradient orthogonality, as described by OpenCV cornerSubPix:
// https://docs.opencv.org/4.13.0/dd/d1a/group__imgproc__feature.html
// Kept independent of OpenCV.js, whose default build omits cornerSubPix.
export async function refineCorners(
  image,
  points,
  { radius = 5, iterations = 40, epsilon = 0.001, current = () => true } = {},
) {
  if (!Number.isInteger(radius) || radius < 1 || radius > 15)
    throw Error("Le demi-voisinage d’affinage doit être un entier entre 1 et 15.");
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 100 ||
    !Number.isFinite(epsilon) ||
    epsilon <= 0
  )
    throw Error("Critères d’affinage invalides.");
  if (points.length && (image.width < 2 * radius + 5 || image.height < 2 * radius + 5))
    throw Error("Image trop petite pour la fenêtre d’affinage choisie.");
  const pixel = (x, y) =>
    image.data[
      Math.max(0, Math.min(image.height - 1, y)) * image.width +
        Math.max(0, Math.min(image.width - 1, x))
    ];
  const sample = (x, y) => {
    const left = Math.floor(x),
      top = Math.floor(y),
      dx = x - left,
      dy = y - top;
    return Math.fround(
      (1 - dy) * ((1 - dx) * pixel(left, top) + dx * pixel(left + 1, top)) +
        dy * ((1 - dx) * pixel(left, top + 1) + dx * pixel(left + 1, top + 1)),
    );
  };
  const offsets = [];
  for (let y = -radius; y <= radius; y++)
    for (let x = -radius; x <= radius; x++)
      offsets.push({ x, y, weight: Math.fround(Math.exp(-(x * x + y * y) / (radius * radius))) });
  const result = [];
  for (let index = 0; index < points.length; index++) {
    if (index % 32 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!current()) throw Error("Calcul remplacé.");
    }
    const initial = points[index];
    let x = Math.fround(initial.x),
      y = Math.fround(initial.y);
    for (let iteration = 0; iteration < iterations; iteration++) {
      let xx = 0,
        xy = 0,
        yy = 0,
        bx = 0,
        by = 0;
      for (const offset of offsets) {
        const px = x + offset.x,
          py = y + offset.y;
        const gx = sample(px + 1, py) - sample(px - 1, py),
          gy = sample(px, py + 1) - sample(px, py - 1);
        const a = gx * gx * offset.weight,
          b = gx * gy * offset.weight,
          c = gy * gy * offset.weight;
        xx += a;
        xy += b;
        yy += c;
        bx += a * offset.x + b * offset.y;
        by += b * offset.x + c * offset.y;
      }
      const determinant = xx * yy - xy * xy;
      if (Math.abs(determinant) <= Number.EPSILON ** 2) break;
      const nextX = Math.fround(x + (yy * bx - xy * by) / determinant),
        nextY = Math.fround(y + (xx * by - xy * bx) / determinant);
      if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) break;
      const change = (nextX - x) ** 2 + (nextY - y) ** 2;
      x = nextX;
      y = nextY;
      if (change <= epsilon ** 2) break;
    }
    if (Math.abs(x - initial.x) > radius || Math.abs(y - initial.y) > radius) {
      x = initial.x;
      y = initial.y;
    }
    result.push({ ...initial, x, y });
  }
  return result;
}
