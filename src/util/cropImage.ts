import type { Box, Edges, Pixels } from './imageEdges';
import { detectEdges } from './imageEdges';

// Browser-side helpers for the upload crop tool.

// Edge analysis runs on a downscaled copy: lines that span most of the image survive
// scaling, and 600px keeps it to a few milliseconds even for large screenshots.
const ANALYSIS_SIZE = 600;

export function analyzeImage(img: HTMLImageElement): Edges | null {
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.drawImage(img, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels: Pixels = { data: image.data, width, height };
  return detectEdges(pixels);
}

// Returns the file cut to `crop` (fractions of the image), at full resolution, in the
// original format where the browser can encode it.
export async function cropFile(file: File, crop: Box): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const sx = Math.round(crop.x * img.naturalWidth);
    const sy = Math.round(crop.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(crop.width * img.naturalWidth));
    const sh = Math.max(1, Math.round(crop.height * img.naturalHeight));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not crop the image.');
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not crop the image.'))),
        file.type,
        0.95
      )
    );
    return new File([blob], file.name, { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
