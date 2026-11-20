import QRCode from 'qrcode';

/**
 * Naklejka 100×70 mm (właściciel 2026-11-20: jeden rozmiar), druk termiczny 203 dpi (8 px/mm), obraz poziomy 800×560 px.
 * Czarno na białym. Góra: tytuł i klient na całą szerokość; niżej duży QR po lewej, po prawej opis, logo, firma, numer, kontakt.
 */
export const LABEL_PX = [800, 560] as const;
export const LABEL_MM = [100, 70] as const;

export type Firma = { nazwa: string; telefon: string; www: string };
export type LabelData = { url: string; numer: string; klient: string; firma: Firma };

const FONT = 'Arial, Helvetica, Roboto, sans-serif';

export function drawLabel(canvas: HTMLCanvasElement, d: LabelData, logo?: CanvasImageSource): void {
  const [W, H] = LABEL_PX;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pad = 28;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  // wiersz w danej szerokości: czcionka zmniejszana do 60%
  const fit = (text: string, weight: number, fs: number, maxW: number) => {
    let f = fs;
    ctx.font = `${weight} ${f}px ${FONT}`;
    while (ctx.measureText(text).width > maxW && f > fs * 0.6) { f -= 0.5; ctx.font = `${weight} ${f}px ${FONT}`; }
    return f;
  };
  const line = (text: string, weight: number, fs: number, x: number, y: number, maxW: number, align: CanvasTextAlign = 'left') => {
    const f = fit(text, weight, fs, maxW);
    ctx.textAlign = align;
    ctx.fillText(text, align === 'center' ? x + maxW / 2 : x, y);
    return y + f * 1.18;
  };

  // góra: tytuł i klient, wyśrodkowane, pod spodem kreska
  let y = pad - 4;
  y = line('PASZPORT INSTALACJI', 800, 50, pad, y, W - 2 * pad, 'center');
  y = line(d.klient, 700, 40, pad, y + 2, W - 2 * pad, 'center');
  y = Math.round(y + 8);
  ctx.fillRect(pad, y, W - 2 * pad, 4);
  const top = y + 4 + 26; // odstęp od kreski: cisza wokół QR do skanowania

  // QR: całkowita liczba pikseli na moduł (ostre krawędzie)
  const qr = QRCode.create(d.url, { errorCorrectionLevel: 'M' }).modules;
  const px = Math.max(2, Math.floor((H - pad - top) / qr.size));
  const qs = px * qr.size, qy = top + Math.floor((H - pad - top - qs) / 2);
  for (let j = 0; j < qr.size; j++) for (let i = 0; i < qr.size; i++) if (qr.data[j * qr.size + i]) ctx.fillRect(pad + i * px, qy + j * px, px, px);

  // prawa kolumna
  const cx = pad + qs + 30, cw = W - pad - cx;
  const contact = [d.firma.telefon && `tel. ${d.firma.telefon}`, d.firma.www].filter(Boolean) as string[];
  const logoH = 84;
  const blockH = 2 * 26 * 1.18 + 18 + logoH + 18 + (d.firma.nazwa ? 30 * 1.18 : 0) + 40 * 1.18 + contact.length * 25 * 1.18;
  y = top + Math.max(0, (H - pad - top - blockH) / 2);
  y = line('Zeskanuj kod: historia', 500, 26, cx, y, cw);
  y = line('serwisowa i dokumentacja', 500, 26, cx, y, cw);
  y += 18;
  // logo: znak + „ETNER” + hasło
  const word = 60, tag = 15;
  const markW = logo ? logoH : 0, tx = cx + markW + (logo ? 12 : 0);
  if (logo) {
    const ih = Number((logo as HTMLImageElement | HTMLCanvasElement).height);
    ctx.drawImage(logo, 0, 0, ih, ih, cx, y, logoH, logoH);
  }
  ctx.textAlign = 'left';
  ctx.font = `700 ${fit('ETNER', 700, word, cw - markW - 12)}px ${FONT}`;
  ctx.fillText('ETNER', tx, y + logoH / 2 - word * 0.7);
  ctx.font = `600 ${tag}px ${FONT}`;
  ctx.fillText('INTELIGENTNY WYBÓR', tx + 2, y + logoH / 2 + 10);
  y += logoH + 18;
  if (d.firma.nazwa) y = line(d.firma.nazwa, 700, 30, cx, y, cw);
  y = line(`Nr ${d.numer}`, 800, 40, cx, y, cw);
  for (const c of contact) y = line(c, 600, 25, cx, y, cw);
}

export const labelBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Nie udało się zapisać obrazu'))), 'image/png'));

/** Druk systemowy: jedna naklejka 100×70 mm na stronie albo arkusz A4 (siatka, 2 mm odstępu na cięcie). */
export async function printLabel(src: string, sheet: boolean): Promise<void> {
  const [w, h] = LABEL_MM;
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
