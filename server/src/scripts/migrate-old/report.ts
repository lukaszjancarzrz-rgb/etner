import { count } from 'drizzle-orm';
import type { Db } from '../../core/db.js';
import * as harmonogram from '../../modules/harmonogram/service.js';
import { clients } from '../../modules/klienci/schema.js';
import * as leady from '../../modules/leady/service.js';
import * as uzytkownicy from '../../modules/uzytkownicy/service.js';
import * as zadania from '../../modules/zadania/service.js';
import * as zakupy from '../../modules/zakupy/service.js';
import * as zlecenia from '../../modules/zlecenia/service.js';
import type { Co, Plan, Review } from './transform.js';

export type ReportRow = { co: string; zrodlo: number | null; baza: number; pominiete: number; roznica: number };
export type Report = { wiersze: ReportRow[]; doPrzejrzenia: Review[] };

const LABEL: Record<Co, string> = {
  zlecenia: 'Zlecenia', wyceny: 'Leady (wyceny)', historia: 'Kontakty z leadami', harmonogram: 'Harmonogram – komórki osób',
  uwagi: 'Harmonogram – uwagi dnia', zadania: 'Zadania i notatki', zakupy: 'Zakupy', osoby: 'Osoby w harmonogramie',
};

/** Źródło (arkusz) / baza / pominięte; różnica ≠ 0 oznacza błąd przeniesienia. */
export function report(plan: Plan, db: Db): Report {
  const days = plan.harmonogram.map((h) => h.dzien).concat(plan.uwagiDnia.map((u) => u.dzien)).sort();
  const range = days.length ? harmonogram.range(db, days[0]!, days.at(-1)!, false).days : [];
  const ls = leady.list(db);
  const baza: Record<Co, number> = {
    zlecenia: zlecenia.list(db).length,
    wyceny: ls.length,
    historia: ls.reduce((n, l) => n + leady.contactsOf(db, l.id).length, 0),
    harmonogram: range.reduce((n, d) => n + new Set(d.entries.map((e) => e.personId)).size, 0),
    uwagi: range.filter((d) => d.note).length,
    zadania: zadania.list(db).length,
    zakupy: zakupy.list(db).length,
    osoby: uzytkownicy.listPeople(db).length,
  };
  const wiersze = (Object.keys(LABEL) as Co[]).map((co) => {
    const pominiete = plan.doPrzejrzenia.filter((r) => r.co === co && r.pominiete).reduce((n, r) => n + r.ile, 0);
    return { co: LABEL[co], zrodlo: plan.zrodlo[co], baza: baza[co], pominiete, roznica: plan.zrodlo[co] - baza[co] - pominiete };
  });
  // Klienci nie istnieją w arkuszu jako osobne wiersze: źródło = liczba po połączeniu.
  const kl = db.select({ n: count() }).from(clients).get()!.n;
  wiersze.push({ co: 'Klienci (po połączeniu)', zrodlo: plan.klienci.length, baza: kl, pominiete: 0, roznica: plan.klienci.length - kl });
  return { wiersze, doPrzejrzenia: plan.doPrzejrzenia };
}

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** Lista „do przejrzenia” jako CSV (średnik, BOM – otwiera się w Excelu po polsku). */
export const reviewCsv = (r: Review[]): string =>
  `﻿${['Arkusz;Wiersz;Dotyczy;Ile;Przeniesiono;Opis', ...r.map((x) => [x.arkusz, x.wiersz ?? '', x.co, x.ile, x.pominiete ? 'nie' : 'tak', x.opis].map(q).join(';'))].join('\r\n')}\r\n`;

/** Tabela raportu do konsoli. */
export function reportText(rep: Report): string {
  const rows = [['Co', 'Arkusz', 'Baza', 'Pominięte', 'Różnica'], ...rep.wiersze.map((w) => [w.co, String(w.zrodlo ?? '–'), String(w.baza), String(w.pominiete), String(w.roznica)])];
  const width = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => (i ? c.padStart(width[i]!) : c.padEnd(width[i]!))).join('  ')).join('\n');
}
