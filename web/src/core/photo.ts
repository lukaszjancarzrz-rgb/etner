const MAX = 2560;

/** Zdjęcie z telefonu: dłuższy bok najwyżej 2560 px, JPEG 0.85, obrót wg EXIF. Inne pliki bez zmian. */
export async function resizePhoto(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // przeglądarka nie zna formatu; serwer oceni
  }
  try {
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    // małe JPEG/PNG/WebP bez zmian; inne formaty (np. HEIC) i tak na JPEG
    if (k === 1 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } finally {
    bmp.close();
  }
}
