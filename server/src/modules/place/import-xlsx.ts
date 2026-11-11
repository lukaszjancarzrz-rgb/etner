import ExcelJS from 'exceljs';
import { isNull } from 'drizzle-orm';
import { norm, PARAMETRY_2026, type Forma, type Parametry, type RodzajWpisu } from '@etner/shared';
import type { Db } from '../../core/db.js';
import { day, num, raw, text } from '../../scripts/migrate-old/read-xlsx.js';
import { schedulePeople } from '../uzytkownicy/schema.js';
import { createEntry, createRate, getParametry, setMonth, setParametry, setPerson } from './service.js';

/** Jednorazowe przeniesienie Płac z arkusza firmy: karty Pracownicy, Parametry, Godziny, Zaliczki i dodatki (rok z Pracownicy!D4). */
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const FORMA: Record<string, Forma> = { 'umowa o pracę': 'uop', 'umowa zlecenie': 'zlecenie', 'inna umowa (koszt ręcznie)': 'inna' };
const RODZAJ: Record<string, RodzajWpisu> = { 'zaliczka / wypłata': 'zaliczka', 'przelew na konto': 'przelew', 'premia / dodatek': 'premia', 'inny koszt firmy': 'inny' };
const gr = (zl: number | null) => (zl === null ? null : Math.round(zl * 100));
const mm = (rok: number, i: number) => `${rok}-${String(i + 1).padStart(2, '0')}`;

export interface XlsOsoba {
  nazwa: string; forma: Forma; umowaOd: string | null; umowaDo: string | null; bruttoGr: number | null; kosztRecznyGr: number | null; kupGr: number | null;
  urlopDni: number; etat: number | null; staz10: boolean; uwagi: string;
  /** stawka podstawowa; wyjątki to liczby wpisane w kartę Godziny zamiast formuły (po miesiącach, null = brak) */
  stawkaGr: number | null; stawkiMies: (number | null)[]; godziny: (number | null)[]; kosztyUmowy: (number | null)[];
}
export interface XlsWpis { nazwa: string; miesiac: string; dzien: string | null; rodzaj: RodzajWpisu; kwotaGr: number; opis: string }
export interface XlsData { rok: number; osoby: XlsOsoba[]; parametry: Parametry; wpisy: XlsWpis[]; ostrzezenia: string[] }

export async function readPlace(buf: Buffer): Promise<XlsData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const ws = (name: string) => {
    const s = wb.getWorksheet(name);
    if (!s) throw new Error(`Brak karty „${name}” w pliku`);
    return s;
  };
  const prc = ws('Pracownicy'), par = ws('Parametry'), god = ws('Godziny'), zal = ws('Zaliczki i dodatki');
  const cell = (s: ExcelJS.Worksheet, r: number, c: number) => raw(s.getCell(r, c));
  /** liczba wpisana ręcznie (nie formuła) */
  const plain = (s: ExcelJS.Worksheet, r: number, c: number) => { const v = s.getCell(r, c).value; return typeof v === 'number' ? v : null; };
  const rok = num(cell(prc, 4, 4));
  if (!rok) throw new Error('Nie ustalono roku arkusza (Pracownicy, D4)');
  const ostrzezenia: string[] = [];

  const osoby: XlsOsoba[] = [];
  for (let i = 0; i < 8; i++) {
    const r = 7 + i;
    const nazwa = text(cell(prc, r, 3));
    if (!nazwa) continue;
    const forma = FORMA[text(cell(prc, r, 4)).toLowerCase()] ?? 'brak';
    const stawka = gr(num(cell(prc, r, 5)));
    osoby.push({
      nazwa, forma, umowaOd: day(cell(prc, r, 6)), umowaDo: day(cell(prc, r, 7)), bruttoGr: gr(num(cell(prc, r, 8))), kosztRecznyGr: gr(num(cell(prc, r, 9))),
      kupGr: gr(num(cell(par, 24 + i, 5))), urlopDni: num(cell(prc, r, 12)) ?? 0, etat: num(cell(prc, r, 13)), staz10: text(cell(prc, r, 14)).toLowerCase() === 'tak', uwagi: text(cell(prc, r, 16)),
      stawkaGr: stawka,
      stawkiMies: Array.from({ length: 12 }, (_, m) => gr(plain(god, 19 + i, 4 + m))),
      godziny: Array.from({ length: 12 }, (_, m) => num(cell(god, 6 + i, 4 + m)) || null),
      kosztyUmowy: Array.from({ length: 12 }, (_, m) => gr(plain(god, 30 + i, 4 + m))),
    });
  }

  const p = (r: number, domyslna: number) => num(cell(par, r, 3)) ?? domyslna;
  const d = PARAMETRY_2026;
  const parametry: Parametry = {
    placaMinGr: gr(num(cell(par, 6, 3))) ?? d.placaMinGr, emP: p(7, d.emP), rentP: p(8, d.rentP), chor: p(9, d.chor), zdr: p(10, d.zdr), pit: p(11, d.pit),
    kwotaZmnGr: gr(num(cell(par, 12, 3))) ?? d.kwotaZmnGr, kupGr: gr(num(cell(par, 13, 3))) ?? d.kupGr, kupZl: p(14, d.kupZl),
    emF: p(15, d.emF), rentF: p(16, d.rentF), wyp: p(17, d.wyp), fp: p(18, d.fp), fgsp: p(19, d.fgsp), godzDnia: p(20, d.godzDnia),
    urlopMin: p(74, d.urlopMin), urlopMax: p(75, d.urlopMax), godzUrlop: p(76, d.godzUrlop),
  };

  const wpisy: XlsWpis[] = [];
  for (let r = 10; r <= 309; r++) {
    const nazwa = text(cell(zal, r, 5));
    if (!nazwa) continue;
    const dzien = day(cell(zal, r, 3));
    const i = MIESIACE.indexOf(text(cell(zal, r, 4)).toLowerCase());
    const miesiac = i >= 0 ? mm(rok, i) : dzien?.slice(0, 7);
    const rodzaj = RODZAJ[text(cell(zal, r, 6)).toLowerCase()];
    const kwota = gr(num(cell(zal, r, 7)));
    if (!miesiac || !rodzaj || kwota === null) { ostrzezenia.push(`Zaliczki i dodatki, wiersz ${r}: pominięty (${!miesiac ? 'brak miesiąca' : !rodzaj ? 'nieznany rodzaj' : 'brak kwoty'})`); continue; }
    wpisy.push({ nazwa, miesiac, dzien, rodzaj, kwotaGr: kwota, opis: text(cell(zal, r, 8)) });
  }
  return { rok, osoby, parametry, wpisy, ostrzezenia };
}

export interface XlsImportResult { rok: number; osoby: number; stawki: number; miesiace: number; wpisy: number; ostrzezenia: string[] }

/** Zapis w bieżącej transakcji (wywołuj w tx). */
export function applyPlace(db: Db, userId: string, x: XlsData): XlsImportResult {
  const ludzie = new Map(db.select().from(schedulePeople).where(isNull(schedulePeople.deletedAt)).all().map((s) => [norm(s.nazwa), s.id]));
  const ostrzezenia = [...x.ostrzezenia];
  const nieznane = new Set<string>();
  const znajdz = (nazwa: string) => {
    const id = ludzie.get(norm(nazwa));
    if (!id && !nieznane.has(nazwa)) { nieznane.add(nazwa); ostrzezenia.push(`Nie ma takiej osoby w harmonogramie: ${nazwa} (pominięta)`); }
    return id;
  };
  let osoby = 0, stawki = 0, miesiace = 0, wpisy = 0;
  for (const o of x.osoby) {
    const personId = znajdz(o.nazwa);
    if (!personId) continue;
    const { nazwa: _n, stawkaGr, stawkiMies, godziny, kosztyUmowy, ...dane } = o;
    setPerson(db, userId, personId, dane);
    osoby++;
    if (stawkaGr !== null) {
      // historia stawek: wiersz tylko tam, gdzie stawka miesiąca zmienia się względem poprzedniego
      let ostatnia: number | null = null;
      stawkiMies.forEach((w, m) => {
        const s = w ?? stawkaGr;
        if (s !== ostatnia) { createRate(db, userId, { personId, odMiesiaca: mm(x.rok, m), stawkaGr: s }); stawki++; }
        ostatnia = s;
      });
    }
    for (let m = 0; m < 12; m++) if (setMonth(db, userId, personId, mm(x.rok, m), { godziny: godziny[m]!, kosztUmowyGr: kosztyUmowy[m]! })) miesiace++;
  }
  for (const w of x.wpisy) {
    const personId = znajdz(w.nazwa);
    if (!personId) continue;
    const { nazwa: _n, ...dane } = w;
    createEntry(db, userId, { personId, ...dane });
    wpisy++;
  }
  setParametry(db, { ...getParametry(db), [String(x.rok)]: x.parametry });
  return { rok: x.rok, osoby, stawki, miesiace, wpisy, ostrzezenia };
}
