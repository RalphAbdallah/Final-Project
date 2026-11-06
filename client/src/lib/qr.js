import jsQR from 'jsqr';

/** Reads the text inside a QR code image, in the browser. Returns null if none is found. */
export async function readQrFromFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    // Wallet "share QR" images are often large with the code in the middle;
    // try a comfortable size first, then a smaller one.
    for (const maxSide of [1600, 800]) {
      const text = decode(bitmap, maxSide);
      if (text) return text;
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

function decode(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null;
}
