import ExcelJS from 'exceljs';
import { and, eq, isNull } from 'drizzle-orm';
import { norm, rozbij, type Sposob } from '@etner/shared';
import type { Db } from '../../core/db.js';
import { day, num, raw, text, type V } from '../../scripts/migrate-old/read-xlsx.js';
import { clients, sites } from '../klienci/schema.js';
import * as przeniesienie from '../przeniesienie/service.js';
import { jobs } from '../zlecenia/schema.js';
import * as slowniki from '../slowniki/service.js';
import { createCost, createRevenue, setKpirMonth } from './service.js';

/** Jednorazowe przeniesienie z arkusza firmy: karty Przychody, Koszty, Kontrola KPiR (rok z Pracownicy!D4). */
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const RZYMSKIE = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const KATEGORIE: Record<string, string> = { E: 'Elektryka', RW: 'Rekuperacja', K: 'Klimatyzacja', AM: 'Alarmy i monitoring', SH: 'Smart home', S: 'Sprzedaż', I: 'Inne', H: 'Inne' };
const gr = (zl: number) => Math.round(zl * 100);
const mm = (i: number) => String(i + 1).padStart(2, '0');

export interface XlsRevenue { wiersz: number; kategoria: string | null; dzien: string | null; innyMiesiac: string | null; lokalizacja: string; inwestor: string; opis: string; sposob: Sposob; kwotaGr: number; nrFaktury: string; uwagi: string }
export interface XlsCost { dzien: string; miesiac: string; nrDokumentu: string; kontrahent: string; opis: string; kategoria: string; nettoGr: number; kolumnaKpir: 12 | 13 | 14 | 15; doWyniku: boolean; uwagi: string }
export interface XlsKpir { miesiac: string; przychodGr: number; towaryGr: number; uboczneGr: number; wynagrodzeniaGr: number; pozostaleGr: number }
export interface XlsData { przychody: XlsRevenue[]; koszty: XlsCost[]; kpir: XlsKpir[] }

/** Miesiąc (0–11) z cyfry rzymskiej, nazwy miesiąca albo daty; null = nie rozpoznano. */
function miesiacIdx(v: V): number | null {
  const t = text(v);
  const d = day(v);
  if (d && !/^\d{1,2}$/.test(t)) return Number(d.slice(5, 7)) - 1;
  const i = RZYMSKIE.indexOf(t.toUpperCase());
  const j = MIESIACE.indexOf(t.toLowerCase());
  return i >= 0 ? i : j >= 0 ? j : null;
}

export async function readFinanse(buf: Buffer, znaneKategorie: Set<string>): Promise<XlsData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const ws = (name: string) => {
    const s = wb.getWorksheet(name);
    if (!s) throw new Error(`Brak karty „${name}” w pliku`);
    return s;
  };
  const prz = ws('Przychody'), kos = ws('Koszty'), kpr = ws('Kontrola KPiR');
  const cell = (s: ExcelJS.Worksheet, r: number, c: number) => raw(s.getCell(r, c));

  const przychody: XlsRevenue[] = [];
  const surowyInny: V[] = [];
  for (let r = 7; r <= prz.rowCount; r++) {
    const bez = num(cell(prz, r, 11)), brutto = num(cell(prz, r, 12));
    if (typeof cell(prz, r, 16) !== 'number' && !bez && !brutto) continue;
    const kat = text(cell(prz, r, 3)).toUpperCase();
    const stawka = text(cell(prz, r, 13));
    const faktura: Sposob = stawka.includes('23') ? 'vat23' : 'vat8';
    // wiersz z obiema kwotami (część bez faktury, część z fakturą) = dwa przychody
    const czesci: [Sposob, number, string][] = kat === 'V'
      ? [['zwrot', bez && bez > 0 ? bez : brutto ?? 0, text(cell(prz, r, 18))]]
      : [...(bez && bez > 0 ? [['bez', bez, ''] as [Sposob, number, string]] : []), ...(brutto && brutto > 0 ? [[faktura, brutto, text(cell(prz, r, 18))] as [Sposob, number, string]] : [])];
    const uwagi = [text(cell(prz, r, 21)), kat === 'H' ? 'hydraulika' : ''].filter(Boolean).join('; ');
    for (const [sposob, kwota, nrFaktury] of czesci) {
      if (!kwota) continue;
      surowyInny.push(cell(prz, r, 7));
      przychody.push({
        wiersz: r, kategoria: KATEGORIE[kat] ?? null, dzien: day(cell(prz, r, 5)), innyMiesiac: null,
        lokalizacja: text(cell(prz, r, 8)), inwestor: text(cell(prz, r, 9)), opis: text(cell(prz, r, 10)),
        sposob, kwotaGr: gr(kwota), nrFaktury, uwagi,
      });
    }
  }

  const kosztyRaw: (Omit<XlsCost, 'miesiac'> & { rzym: V })[] = [];
  for (let r = 7; r <= kos.rowCount; r++) {
    const netto = cell(kos, r, 9);
    const dzien = day(cell(kos, r, 3));
    if (typeof netto !== 'number' || !dzien) continue;
    const kat = text(cell(kos, r, 8));
    const kol = parseInt(text(cell(kos, r, 10)), 10);
    kosztyRaw.push({
      dzien, rzym: cell(kos, r, 4), nrDokumentu: text(cell(kos, r, 5)), kontrahent: text(cell(kos, r, 6)), opis: text(cell(kos, r, 7)),
      kategoria: znaneKategorie.has(kat) ? kat : 'Inne', uwagi: znaneKategorie.has(kat) ? '' : `kategoria z pliku: ${kat}`, nettoGr: gr(netto), kolumnaKpir: kol >= 12 && kol <= 15 ? (kol as 12 | 13 | 14 | 15) : 15,
      doWyniku: text(cell(kos, r, 13)).toLowerCase() !== 'nie',
    });
  }

  const rokKomorki = num(cell(ws('Pracownicy'), 4, 4));
  const pierwsza = przychody.find((p) => p.dzien)?.dzien ?? kosztyRaw[0]?.dzien;
  const rok = rokKomorki ?? (pierwsza ? Number(pierwsza.slice(0, 4)) : null);
  if (!rok) throw new Error('Nie ustalono roku arkusza (Pracownicy, D4)');

  przychody.forEach((p, i) => { const m = miesiacIdx(surowyInny[i] ?? null); p.innyMiesiac = m === null ? null : `${rok}-${mm(m)}`; });

  const kpir: XlsKpir[] = [];
  for (let r = 6; r <= 17; r++) {
    const i = MIESIACE.indexOf(text(cell(kpr, r, 2)).toLowerCase());
    const [p, t, u, w, o] = [3, 6, 9, 12, 15].map((c) => gr(num(cell(kpr, r, c)) ?? 0));
    if (i >= 0 && (p || t || u || w || o)) kpir.push({ miesiac: `${rok}-${mm(i)}`, przychodGr: p!, towaryGr: t!, uboczneGr: u!, wynagrodzeniaGr: w!, pozostaleGr: o! });
  }

  return {
    przychody, kpir,
    koszty: kosztyRaw.map(({ rzym, ...k }) => { const m = miesiacIdx(rzym); return { ...k, miesiac: m === null ? k.dzien.slice(0, 7) : `${rok}-${mm(m)}` }; }),
  };
}

export interface XlsImportResult { przychody: number; dopasowane: number; doPrzejrzenia: number; koszty: number; kpirMiesiace: number }

/** Zapis w bieżącej transakcji (wywołuj w tx). */
export function applyFinanse(db: Db, userId: string, d: XlsData): XlsImportResult {
  const kliencie = new Map<string, string[]>(); // znormalizowana nazwa -> id klientów
  for (const k of db.select().from(clients).where(isNull(clients.deletedAt)).all()) kliencie.set(norm(k.nazwa), [...(kliencie.get(norm(k.nazwa)) ?? []), k.id]);
  const zleceniaKlienta = new Map<string, (typeof jobs.$inferSelect)[]>();
  for (const j of db.select().from(jobs).where(isNull(jobs.deletedAt)).all()) zleceniaKlienta.set(j.clientId, [...(zleceniaKlienta.get(j.clientId) ?? []), j]);
  const miejscowosc = new Map(db.select().from(sites).where(isNull(sites.deletedAt)).all().map((s) => [s.id, norm(s.miejscowosc)]));
  const review: przeniesienie.ReviewInput[] = [];
  let dopasowane = 0;
  for (const p of d.przychody) {
    const inw = norm(p.inwestor);
    const jego = inw ? (kliencie.get(inw) ?? []).flatMap((id) => zleceniaKlienta.get(id) ?? []) : [];
    const wKat = jego.filter((j) => j.kategoria === p.kategoria);
    const loc = norm(p.lokalizacja);
    const job = wKat.length === 1 ? wKat[0] : wKat.find((j) => loc && j.siteId && miejscowosc.get(j.siteId) === loc);
    const row = createRevenue(db, userId, {
      jobId: job?.id ?? null, kategoria: p.kategoria, klient: p.inwestor, miejscowosc: p.lokalizacja, opis: p.opis, sposob: p.sposob,
      kwotaGr: p.kwotaGr, dzien: p.dzien, innyMiesiac: p.innyMiesiac, nrFaktury: p.nrFaktury, uwagi: p.uwagi,
    });
    if (job) { dopasowane++; continue; }
    review.push({ co: 'przychody', arkusz: 'Przychody', wiersz: p.wiersz, dzien: p.dzien, osoba: p.inwestor, tekst: p.opis, opis: `Przychód bez zlecenia: ${p.inwestor}, ${row.miesiac ?? ''}`, ile: 1, pominiete: false });
  }
  przeniesienie.add(db, userId, review);
  for (const k of d.koszty) createCost(db, userId, { ...k, nip: '' });
  for (const { miesiac, ...k } of d.kpir) setKpirMonth(db, userId, miesiac, k);
  return { przychody: d.przychody.length, dopasowane, doPrzejrzenia: review.length, koszty: d.koszty.length, kpirMiesiace: d.kpir.length };
}

export const znaneKategorieKosztu = (db: Db) => new Set(slowniki.list(db, 'kategoria_kosztu').map((s) => s.wartosc));
