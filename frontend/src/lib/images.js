/**
 * Downscales a photo on the phone before upload (PRD M3): long side ≤ 1600 px,
 * JPEG. Receipts stay sharp enough to read (the 1600 px Castle photo reads
 * exactly) while the upload and the AI's image tokens shrink.
 */
export async function prepareReceiptPhoto(file, maxSide = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', quality),
    );
  } finally {
    bitmap.close?.();
  }
}
