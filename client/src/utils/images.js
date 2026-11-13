/**
 * Shrinks a photo on the phone before upload (PRD M3): long side at most 1600 px, JPEG.
 * Receipts stay sharp enough to read, while the upload and the AI's cost shrink.
 * Returns a data URL ("data:image/jpeg;base64,..."): text an <img> can show, that we
 * can keep in localStorage and send inside JSON.
 *
 * Beyond the course: a <canvas> is a drawing surface; we draw the photo on it smaller,
 * then ask it for the picture as JPEG text.
 */
export function prepareReceiptPhoto(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file); // a temporary address for the chosen file
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not_an_image'));
    };
    img.src = url;
  });
}
