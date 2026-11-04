import { anchors } from '@etner/shared';
import QRCode from 'qrcode';

/** Naklejki pod drukarkę termiczną 203 dpi (8 px/mm): rozmiar → [szerokość, wysokość] w pikselach. */
export const LABEL_SIZES = { '50x30': [400, 240], '60x40': [480, 320], '100x50': [800, 400] } as const;
export type LabelSize = keyof typeof LABEL_SIZES;
export const mm = (size: LabelSize) => size.split('x').map(Number) as [number, number];

export type Firma = { nazwa: string; telefon: string; www: string };
export type LabelData = { url: string; numer: string; klient: string; firma: Firma; kategoria?: string };

/**
 * Adres z naklejki: strona klienta, dla teczki z kotwicą jej sekcji. Kotwice jak na serwerze (public.ts):
 * `anchors()` na liście wszystkich teczek obiektu w tej samej kolejności (słownik).
 */
export function labelUrl(origin: string, token: string, kategorie?: string[], kategoria?: string): string {
  const i = kategoria ? kategorie?.indexOf(kategoria) ?? -1 : -1;
  return `${origin}/p/${token}${i >= 0 ? `#${anchors(kategorie!)[i]}` : ''}`;
}

/** Czarny QR na białym; czysty tekst – druk termiczny bez szarości poza logo. */
export function drawLabel(canvas: HTMLCanvasElement, size: LabelSize, d: LabelData, logo?: CanvasImageSource): void {
  const [W, H] = LABEL_SIZES[size];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const u = H / 240; // skala względem 50×30
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // QR: kwadrat na całą wysokość, całkowita liczba pikseli na moduł (ostre krawędzie), margines min. 2 moduły
  const qr = QRCode.create(d.url, { errorCorrectionLevel: 'M' }).modules;
  const px = Math.floor(H / (qr.size + 4));
  const off = Math.round((H - px * qr.size) / 2);
  ctx.fillStyle = '#000';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.data[y * qr.size + x]) ctx.fillRect(off + x * px, off + y * px, px, px);

  // tekst po prawej
  const x0 = off * 2 + px * qr.size - Math.round(6 * u), maxW = W - x0 - Math.round(10 * u);
  let y = Math.round(16 * u);
  const line = (text: string, weight: number, fs: number, gap = 4) => {
    if (!text) return;
    let f = fs * u;
    const font = () => `${weight} ${f}px Archivo, system-ui, sans-serif`;
    ctx.font = font();
    while (ctx.measureText(text).width > maxW && f > fs * u * 0.75) { f -= u; ctx.font = font(); }
    let t = text;
    while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + '…';
    ctx.textBaseline = 'top';
    ctx.fillText(t, x0, y);
    y += f + gap * u;
  };
  const logoH = Math.round(28 * u);
  if (logo) ctx.drawImage(logo, x0, y, logoH, logoH);
  ctx.save();
  const lx = x0 + (logo ? logoH + 6 * u : 0);
  ctx.font = `900 ${24 * u}px Archivo, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  let name = d.firma.nazwa || 'ETNER';
  while (name.length > 1 && ctx.measureText(name).width > W - lx - 10 * u) name = name.slice(0, -2) + '…';
  ctx.fillText(name, lx, y + logoH / 2);
  ctx.restore();
  y += logoH + 10 * u;
  line('Paszport instalacji', 800, 17);
  line(d.numer, 600, 16);
  line(d.klient, 600, 16);
  if (d.kategoria) line(d.kategoria, 800, 16);
  if (d.firma.telefon) line(`serwis: ${d.firma.telefon}`, 700, 16);
  line(d.firma.www, 500, 14);
}

export const labelBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Nie udało się zapisać obrazu'))), 'image/png'));

/** Druk systemowy: jedna naklejka na stronie `@page` w rozmiarze naklejki albo arkusz A4 (siatka, 2 mm odstępu na cięcie). */
export async function printLabel(src: string, size: LabelSize, sheet: boolean): Promise<void> {
  const [w, h] = mm(size);
  const cols = Math.floor(192 / (w + 2)), rows = Math.floor(279 / (h + 2));
  const root = document.createElement('div');
  root.id = 'label-print';
  root.innerHTML = Array.from({ length: sheet ? cols * rows : 1 }, () => `<img src="${src}" alt="">`).join('');
  const style = document.createElement('style');
  style.textContent = `@media screen{#label-print{display:none}}
@media print{@page{size:${sheet ? 'A4' : `${w}mm ${h}mm`};margin:${sheet ? '9mm' : '0'}}body>*:not(#label-print){display:none!important}
#label-print{display:grid;grid-template-columns:repeat(${sheet ? cols : 1},${w}mm);gap:${sheet ? 2 : 0}mm}#label-print img{width:${w}mm;height:${h}mm;display:block}}`;
  document.head.append(style);
  document.body.append(root);
  const done = () => { root.remove(); style.remove(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  print();
}
