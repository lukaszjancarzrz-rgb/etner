import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { drawLabel, LABEL_MM, LABEL_PX } from './naklejka.js';

/** Płótno w pamięci: zapisuje białe/czarne prostokąty jako piksele (środowisko testów bez canvas). */
function fakeCanvas() {
  const c = { width: 0, height: 0, px: new Uint8Array(0), texts: [] as string[] };
  let fill = '#fff';
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    font: '', textBaseline: '', textAlign: '',
    fillRect(x: number, y: number, w: number, h: number) {
      if (c.px.length !== c.width * c.height) c.px = new Uint8Array(c.width * c.height);
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) c.px[j * c.width + i] = fill === '#000' ? 1 : 0;
    },
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText(t: string) { c.texts.push(t); },
    drawImage() {}, save() {}, restore() {},
  };
  return Object.assign(c, { getContext: () => ctx }) as unknown as HTMLCanvasElement & typeof c;
}

/** Odczyt QR z pikseli: rozmiar modułu z wzorca w lewym górnym rogu (7 modułów czarnych w pierwszym wierszu). */
function readQr(c: ReturnType<typeof fakeCanvas>, n: number): boolean[] {
  let x0 = 0, y0 = 0;
  // pierwszy czarny piksel poniżej kreski pod tytułem (kreska: ciągły pas przez pół szerokości)
  const kreska = (y: number) => { let r = 0; while (c.px[y * c.width + 28 + r]) r++; return r > c.width / 2; };
  outer: for (y0 = 0; y0 < c.height; y0++) { if (kreska(y0)) continue; for (x0 = 0; x0 < c.width; x0++) if (c.px[y0 * c.width + x0]) break outer; }
  let run = 0;
  while (c.px[y0 * c.width + x0 + run]) run++;
  const m = run / 7;
  return Array.from({ length: n * n }, (_, k) => !!c.px[Math.floor(y0 + (Math.floor(k / n) + 0.5) * m) * c.width + Math.floor(x0 + ((k % n) + 0.5) * m)]);
}

const data = { url: 'https://etner.example/p/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd#rekuperacja', numer: 'PSZ-2026-014', klient: 'Jan Kowalski', firma: { nazwa: 'ETNER', telefon: '600 000 000', www: 'etner.example' } };

describe('naklejka', () => {
  it('100×70 mm: piksele 800×560 (poziomo), QR = url, tekst', () => {
    const c = fakeCanvas();
    drawLabel(c, data);
    expect([c.width, c.height]).toEqual([...LABEL_PX]);
    const want = QRCode.create(data.url, { errorCorrectionLevel: 'M' }).modules;
    expect(readQr(c, want.size)).toEqual([...want.data].map(Boolean));
    expect(c.texts).toEqual(expect.arrayContaining(['PASZPORT INSTALACJI', 'Jan Kowalski', 'ETNER', 'Nr PSZ-2026-014', 'tel. 600 000 000', 'etner.example']));
  });

  it('203 dpi: 8 px na mm, obraz poziomy', () => {
    expect(LABEL_PX.map((p) => p / 8)).toEqual([...LABEL_MM]);
  });
});
