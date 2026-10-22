import { afterEach, expect, it, vi } from 'vitest';
import { resizePhoto } from './photo.js';

afterEach(() => vi.unstubAllGlobals());

it('plik nie-zdjęcie wraca bez zmian', async () => {
  const f = new Blob(['%PDF-'], { type: 'application/pdf' });
  expect(await resizePhoto(f)).toBe(f);
});

it('małe zdjęcie wraca bez zmian', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 900, close })));
  const f = new Blob(['x'], { type: 'image/jpeg' });
  expect(await resizePhoto(f)).toBe(f);
  expect(createImageBitmap).toHaveBeenCalledWith(f, { imageOrientation: 'from-image' });
  expect(close).toHaveBeenCalled();
});

it('duże zdjęcie: dłuższy bok 2560, JPEG 0.85', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close() {} })));
  const conv = vi.fn(async () => new Blob(['y'], { type: 'image/jpeg' }));
  const drawImage = vi.fn();
  vi.stubGlobal('OffscreenCanvas', class { constructor(public width: number, public height: number) {} getContext() { return { drawImage }; } convertToBlob = conv; });
  const out = await resizePhoto(new Blob(['x'], { type: 'image/heic' }));
  expect(out.type).toBe('image/jpeg');
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1920);
  expect(conv).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.85 });
});
