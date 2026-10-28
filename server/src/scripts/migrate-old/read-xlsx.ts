import ExcelJS from 'exceljs';
import { COLS, HARM, HEADER_ROW, PARAM, SHEETS, sectionName, type Cols } from './layout.js';
import { oldDataSchema, type OldData } from './old-data.js';

type V = string | number | boolean | Date | null;

/** Wartość komórki: wynik formuły, tekst z formatowania, błąd = puste. */
function raw(c: ExcelJS.Cell): V {
  const v = c.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as V;
  const o = v as Record<string, unknown>;
  if ('result' in o) return o.result instanceof Date || typeof o.result !== 'object' ? (o.result as V) ?? null : null;
  if ('richText' in o) return (o.richText as { text: string }[]).map((r) => r.text).join('');
  if ('text' in o) return String(o.text);
  return null;
}

const text = (v: V): string => (v === null || typeof v === 'boolean' ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** Data z komórki: data Excela, numer seryjny albo tekst „dd.mm.rrrr”. */
function day(v: V): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 36526 && v < 73051) return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const m = typeof v === 'string' ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(v.trim()) : null;
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}

function num(v: V): number | null {
  if (typeof v === 'number') return v;
  const n = typeof v === 'string' && v.trim() ? Number(v.replace(/\s|zł/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

const conv = { t: text, d: day, n: num } as const;

/** Kolumny ze znacznikami sekcji („@…”); tabela zaczyna się kolumnę dalej. */
function markerCols(ws: ExcelJS.Worksheet): number[] {
  const cols = new Set<number>();
  ws.eachRow((row) => row.eachCell((c) => { const v = raw(c); if (typeof v === 'string' && v.startsWith('@')) cols.add(Number(c.col)); }));
  return [...cols].sort((a, b) => a - b);
}

/**
 * Wiersze tabeli zaczynającej się w `startCol` (kolumna „Lp.”): kolumny po tekście nagłówka do pierwszej pustej komórki,
 * sekcja ze znacznika w kolumnie obok, wiersze nagłówków i tytułów sekcji pominięte, pusty wiersz = brak pól z danymi.
 */
function readTable<C extends Cols>(ws: ExcelJS.Worksheet, headerRow: number, startCol: number, cols: C, sections: boolean) {
  const at = new Map<string, number>();
  for (let c = startCol; text(raw(ws.getCell(headerRow, c))); c++) {
    const h = text(raw(ws.getCell(headerRow, c)));
    if (!at.has(h)) at.set(h, c);
  }
  const out: ({ wiersz: number; sekcja: string } & { [K in keyof C]: ReturnType<(typeof conv)[C[K][1]]> })[] = [];
  let sekcja: string | null = sections ? null : '';
  for (let r = 1; r <= ws.rowCount; r++) {
    if (sections) {
      const m = raw(ws.getCell(r, startCol - 1));
      // wiersz znacznika = tytuł sekcji (scalone komórki, exceljs powtarza tytuł w każdej z nich)
      if (typeof m === 'string' && m.startsWith('@')) { sekcja = sectionName(m); continue; }
    }
    if (r <= headerRow || sekcja === null || text(raw(ws.getCell(r, startCol))) === 'Lp.') continue;
    const rec: Record<string, unknown> = {};
    let filled = false;
    for (const [k, [h, kind]] of Object.entries(cols)) {
      const c = at.get(h);
      const v = c === undefined ? null : conv[kind](raw(ws.getCell(r, c)));
      rec[k] = v;
      if (v !== null && v !== '') filled = true;
    }
    if (filled) out.push({ ...rec, wiersz: r, sekcja } as (typeof out)[number]);
  }
  return out;
}

/** Lewa tabela (sekcje bieżące) i archiwum po prawej: każda przy swojej kolumnie znaczników. */
const readSections = <C extends Cols>(ws: ExcelJS.Worksheet, headerRow: number, cols: C) =>
  markerCols(ws).flatMap((mc) => readTable(ws, headerRow, mc + 1, cols, true));

function readHarmonogram(ws: ExcelJS.Worksheet): OldData['harmonogram'] {
  const hr = HEADER_ROW.harmonogram;
  const head: { col: number; h: string }[] = [];
  ws.getRow(hr).eachCell((c) => { const h = text(raw(c)); if (h) head.push({ col: Number(c.col), h }); });
  const colOf = (p: (h: string) => boolean) => head.find((x) => p(x.h))?.col;
  const dataCol = colOf((h) => h === HARM.data), first = colOf((h) => h === HARM.swieto), uwagiCol = colOf((h) => h.startsWith(HARM.uwagi)), end = colOf((h) => h === HARM.koniec);
  if (!dataCol || !first || !uwagiCol || !end) throw new Error(`Harmonogram: brak nagłówków w wierszu ${hr} (Data, Święto / miesiąc, Uwagi, mies.)`);
  const persons = head.filter((x) => x.col > first && x.col < end && x.col !== uwagiCol)
    .map((x) => ({ col: x.col, kol: ws.getColumn(x.col).letter, nazwa: x.h, placowa: x.col < uwagiCol }));
  const days: OldData['harmonogram']['days'] = [];
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const dzien = day(raw(ws.getCell(r, dataCol)));
    if (!dzien) continue;
    const komorki: Record<string, string> = {};
    for (const p of persons) { const v = text(raw(ws.getCell(r, p.col))); if (v) komorki[p.kol] = v; }
    const uwagi = text(raw(ws.getCell(r, uwagiCol)));
    if (uwagi || Object.keys(komorki).length) days.push({ wiersz: r, dzien, komorki, uwagi });
  }
  return { persons: persons.map(({ kol, nazwa, placowa }) => ({ kol, nazwa, placowa })), days };
}

/** Wartości listy pod nagłówkiem (do pierwszej pustej komórki); `next` = także kolumna obok. */
function listUnder(ws: ExcelJS.Worksheet, header: string): { v: string; next: string }[] {
  let at: ExcelJS.Cell | undefined;
  ws.eachRow((row) => row.eachCell((c) => { if (!at && text(raw(c)) === header) at = c; }));
  const out: { v: string; next: string }[] = [];
  if (!at) return out;
  for (let r = Number(at.row) + 1; text(raw(ws.getCell(r, Number(at.col)))); r++) {
    out.push({ v: text(raw(ws.getCell(r, Number(at.col)))), next: text(raw(ws.getCell(r, Number(at.col) + 1))) });
  }
  return out;
}

/** Odczyt arkusza Firma_2026 (plik albo bufor .xlsx) – tylko karty modułu 1. */
export async function readOld(src: string | Buffer): Promise<OldData> {
  const wb = new ExcelJS.Workbook();
  if (typeof src === 'string') await wb.xlsx.readFile(src);
  else await wb.xlsx.load(src as never);
  const ws = (name: string) => {
    const s = wb.getWorksheet(name);
    if (!s) throw new Error(`Brak karty „${name}” w pliku`);
    return s;
  };
  const par = ws(SHEETS.parametry);
  return oldDataSchema.parse({
    zlecenia: readSections(ws(SHEETS.zlecenia), HEADER_ROW.zlecenia, COLS.zlecenia),
    wyceny: readSections(ws(SHEETS.wyceny), HEADER_ROW.wyceny, COLS.wyceny),
    historia: readTable(ws(SHEETS.historia), HEADER_ROW.historia, 2, COLS.historia, false).map(({ sekcja: _s, ...h }) => h),
    harmonogram: readHarmonogram(ws(SHEETS.harmonogram)),
    zadania: readSections(ws(SHEETS.zadania), HEADER_ROW.zadania, COLS.zadania),
    zakupy: readSections(ws(SHEETS.zakupy), HEADER_ROW.zakupy, COLS.zakupy),
    parametry: {
      kategorie: listUnder(par, PARAM.kategorie).map((x) => ({ kod: x.v, nazwa: x.next })),
      kody: listUnder(par, PARAM.kody).map((x) => x.v),
    },
  });
}
