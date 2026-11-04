import QRCode from 'qrcode';

/** Naklejki pod drukarkę termiczną 203 dpi (8 px/mm): rozmiar → [szerokość, wysokość] w pikselach. */
export const LABEL_SIZES = { '50x30': [400, 240], '60x40': [480, 320], '100x50': [800, 400] } as const;
export type LabelSize = keyof typeof LABEL_SIZES;
export const mm = (size: LabelSize) => size.split('x').map(Number) as [number, number];

/** Techniczny krój jak na tabliczkach urządzeń; wąski – więcej tekstu w szerokości naklejki. Bez sieci: Arial Narrow / systemowy. */
export const LABEL_FONT = 'Barlow Semi Condensed';
export const LABEL_FONT_CSS = `https://fonts.googleapis.com/css2?family=${LABEL_FONT.replace(/ /g, '+')}:wght@500;600;700;800&display=swap`;

export type Firma = { nazwa: string; telefon: string; www: string };
export type LabelData = { url: string; numer: string; klient: string; firma: Firma };

/** Czarny QR na białym; czysty tekst – druk termiczny bez szarości poza logo. */
export function drawLabel(canvas: HTMLCanvasElement, size: LabelSize, d: LabelData, logo?: CanvasImageSource): void {
  const [W, H] = LABEL_SIZES[size];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const u = H / 240; // skala względem 50×30
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // QR: ok. 2/3 wysokości (moduł ≥ 3 px ≈ 0,4 mm – czytelny telefonem), cisza 4 moduły od lewej; reszta na tekst
  const qr = QRCode.create(d.url, { errorCorrectionLevel: 'M' }).modules;
  const px = Math.max(3, Math.floor((H * 0.7) / qr.size));
  const qx = px * 4, qy = Math.round((H - px * qr.size) / 2);
  ctx.fillStyle = '#000';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.data[y * qr.size + x]) ctx.fillRect(qx + x * px, qy + y * px, px, px);

  // tekst po prawej: duże litery; za szeroki wiersz – mniejsza czcionka, potem zawinięcie na 2 wiersze
  const x0 = qx + px * qr.size + Math.round(14 * u), maxW = W - x0 - Math.round(8 * u);
  const font = (weight: number, f: number) => `${weight} ${f}px "${LABEL_FONT}", "Arial Narrow", system-ui, sans-serif`;
  const LOGO_GAP = 1.4; // logo ≈ wysokość wiersza nazwy + odstęp
  type L = { text: string; weight: number; fs: number; logo?: boolean };
  const wrap = (text: string, w: number): string[] => {
    const words = text.split(' ');
    let a = words.shift() ?? '';
    while (words.length && ctx.measureText(`${a} ${words[0]}`).width <= w) a += ` ${words.shift()}`;
    return words.length ? [a, words.join(' ')] : [a];
  };
  const fit = (l: L, k: number): { rows: string[]; f: number } => {
    const max = l.fs * k * u;
    let w = maxW;
    for (let f = max; f >= max * 0.5; f -= u) {
      w = maxW - (l.logo && logo ? f * LOGO_GAP : 0);
      ctx.font = font(l.weight, f);
      if (ctx.measureText(l.text).width <= w) return { rows: [l.text], f };
      // od 80% rozmiaru w dół: dwa wiersze zamiast dalszego zmniejszania
      const r = f <= max * 0.8 ? wrap(l.text, w) : [];
      if (r.length === 2 && r.every((t) => ctx.measureText(t).width <= w)) return { rows: r, f };
    }
    let t = l.text;
    while (t.length > 1 && ctx.measureText(t).width > w) t = t.slice(0, -2).trimEnd() + '…';
    return { rows: [t], f: max * 0.5 };
  };
  const lines: L[] = [
    { text: d.firma.nazwa || 'ETNER', weight: 800, fs: 32, logo: true },
    { text: 'Paszport instalacji', weight: 600, fs: 21 },
    { text: d.numer, weight: 700, fs: 27 },
    { text: d.klient, weight: 700, fs: 23 },
    ...(d.firma.telefon ? [{ text: `serwis: ${d.firma.telefon}`, weight: 700, fs: 22 }] : []),
    ...(d.firma.www ? [{ text: d.firma.www, weight: 500, fs: 20 }] : []),
  ];
  const gap = 4 * u, pad = 10 * u;
  const layout = (k: number) => lines.map((l) => ({ l, ...fit(l, k) }));
  const height = (rows: ReturnType<typeof layout>) => rows.reduce((h, r) => h + r.rows.length * r.f * 1.1 + gap, -gap);
  let k = 1, rows = layout(k);
  while (height(rows) > H - 2 * pad && k > 0.6) { k -= 0.05; rows = layout(k); } // za dużo wierszy: wszystko proporcjonalnie mniejsze
  let y = Math.max(pad, (H - height(rows)) / 2);
  ctx.textBaseline = 'top';
  for (const r of rows) {
    ctx.font = font(r.l.weight, r.f);
    let x = x0;
    if (r.l.logo && logo) { const s = r.f * 1.2; ctx.drawImage(logo, x0, y - r.f * 0.1, s, s); x += r.f * LOGO_GAP; }
    for (const t of r.rows) { ctx.fillText(t, x, y); y += r.f * 1.1; }
    y += gap;
  }
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
