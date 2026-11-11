import QRCode from 'qrcode';

/**
 * Naklejki pod drukarkę termiczną 203 dpi (8 px/mm). Klucz = rolka Niimbot (szer.×wys.), obraz pionowy –
 * projekt obrócony o 90° (w aplikacji Niimbot obrót przy druku): [szerokość, wysokość] obrazu w pikselach.
 */
export const LABEL_SIZES = { '50x30': [240, 400], '100x50': [400, 800] } as const;
export type LabelSize = keyof typeof LABEL_SIZES;
/** Wymiary obrazu w mm (pionowo), np. 50x30 → 30×50. */
export const mm = (size: LabelSize) => LABEL_SIZES[size].map((p) => p / 8) as [number, number];

export type Firma = { nazwa: string; telefon: string; www: string };
export type LabelData = { url: string; numer: string; klient: string; firma: Firma };

const FONT = 'Arial, Helvetica, Roboto, sans-serif';

/**
 * Projekt właściciela (Etykieta_PSZ): tytuł, nazwisko, duży QR, „Zeskanuj…”, logo ETNER, firma, numer, kontakt.
 * Czarno na białym – druk termiczny. QR zajmuje to, co zostaje po tekstach.
 */
export function drawLabel(canvas: HTMLCanvasElement, size: LabelSize, d: LabelData, logo?: CanvasImageSource): void {
  const [W, H] = LABEL_SIZES[size];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const u = W / 240, pad = 10 * u, maxW = W - 2 * pad;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  // wiersz: rozmiar zmniejszany do szerokości naklejki (min. 60%)
  const fit = (text: string, weight: number, fs: number) => {
    let f = fs * u;
    ctx.font = `${weight} ${f}px ${FONT}`;
    while (ctx.measureText(text).width > maxW && f > fs * u * 0.6) { f -= u / 2; ctx.font = `${weight} ${f}px ${FONT}`; }
    return f;
  };
  type T = { text: string; weight: number; fs: number };
  const top: T[] = [{ text: 'PASZPORT INSTALACJI', weight: 700, fs: 17 }, { text: d.klient, weight: 700, fs: 15 }];
  const bottom: T[] = [
    { text: 'Zeskanuj: historia serwisowa i dokumentacja', weight: 400, fs: 10.5 },
    ...(d.firma.nazwa ? [{ text: d.firma.nazwa, weight: 700, fs: 17 }] : []),
    { text: `Nr ${d.numer}`, weight: 700, fs: 18 },
    { text: [d.firma.telefon && `tel. ${d.firma.telefon}`, d.firma.www].filter(Boolean).join(' · '), weight: 600, fs: 12 },
  ].filter((t) => t.text);
  const gap = 3 * u, logoH = 50 * u;
  const lines = (ts: T[]) => ts.map((t) => ({ ...t, f: fit(t.text, t.weight, t.fs) }));
  const tl = lines(top), bl = lines(bottom);
  const textH = [...tl, ...bl].reduce((h, t) => h + t.f * 1.15 + gap, 0) + logoH + 2 * gap;

  // QR: całkowita liczba pikseli na moduł (ostre krawędzie), w miejscu, które zostaje
  const qr = QRCode.create(d.url, { errorCorrectionLevel: 'M' }).modules;
  const px = Math.max(2, Math.floor(Math.min(maxW, H - 2 * pad - textH) / qr.size));
  const qs = px * qr.size, qx = Math.round((W - qs) / 2);
  // nadmiar wysokości (duża rolka): całość wyśrodkowana w pionie
  let y = pad + Math.max(0, H - 2 * pad - textH - qs) / 2;
  const draw = (t: { text: string; weight: number; f: number }) => { ctx.font = `${t.weight} ${t.f}px ${FONT}`; ctx.fillText(t.text, W / 2, y); y += t.f * 1.15 + gap; };
  tl.forEach(draw);
  y += gap;
  y = Math.round(y);
  for (let j = 0; j < qr.size; j++) for (let i = 0; i < qr.size; i++) if (qr.data[j * qr.size + i]) ctx.fillRect(qx + i * px, y + j * px, px, px);
  y += qs + gap;
  draw(bl[0]!);
  // logo: znak z public/logo.png (kwadrat po lewej stronie obrazka) + duży napis „ETNER” i hasło – czytelne na małej rolce
  ctx.textAlign = 'left';
  const word = 32 * u, tag = 8.6 * u;
  ctx.font = `700 ${word}px ${FONT}`;
  const wordW = ctx.measureText('ETNER').width;
  ctx.font = `600 ${tag}px ${FONT}`;
  const textW = Math.max(wordW, ctx.measureText('INTELIGENTNY WYBÓR').width);
  const markW = logo ? logoH : 0, rowW = markW + (logo ? 6 * u : 0) + textW, lx = (W - rowW) / 2, tx = lx + markW + (logo ? 6 * u : 0);
  if (logo) {
    const ih = Number((logo as HTMLImageElement | HTMLCanvasElement).height);
    ctx.drawImage(logo, 0, 0, ih, ih, lx, y, logoH, logoH);
  }
  ctx.font = `700 ${word}px ${FONT}`;
  ctx.fillText('ETNER', tx, y + logoH / 2 - word * 0.72);
  ctx.font = `600 ${tag}px ${FONT}`;
  ctx.fillText('INTELIGENTNY WYBÓR', tx + u, y + logoH / 2 + 4 * u);
  ctx.textAlign = 'center';
  y += logoH + 2 * gap;
  bl.slice(1).forEach(draw);
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
