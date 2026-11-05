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

/** `roznica` = źródło − baza − pominięte (musi być 0); null = wiersz informacyjny, bez sprawdzenia. */
export type ReportRow = { co: string; zrodlo: number | null; baza: number; pominiete: number; roznica: number | null };
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
  const wiersze: ReportRow[] = (Object.keys(LABEL) as Co[]).map((co) => {
    const pominiete = plan.doPrzejrzenia.filter((r) => r.co === co && r.pominiete).reduce((n, r) => n + r.ile, 0);
    return { co: LABEL[co], zrodlo: plan.zrodlo[co], baza: baza[co], pominiete, roznica: plan.zrodlo[co] - baza[co] - pominiete };
  });
  // Wpisy harmonogramu wg rodzaju: plan (z arkusza) a baza.
  const entries = range.flatMap((d) => d.entries);
  for (const [rodzaj, label] of [['zlecenie', 'zlecenie'], ['kod', 'kod nieobecności'], ['tekst', 'tekst']] as const) {
    const z = plan.harmonogram.reduce((n, h) => n + h.sloty.filter((s) => s.rodzaj === rodzaj).length, 0);
    const b = entries.filter((e) => e.rodzaj === rodzaj).length;
    wiersze.push({ co: `Harmonogram – wpisy: ${label}`, zrodlo: z, baza: b, pominiete: 0, roznica: z - b });
  }
  // Informacyjne: klienci nie są w arkuszu osobnymi wierszami; dni z kolumny „Dni w harmonogramie” liczą się inaczej (różnice w liście do przejrzenia).
  const kl = db.select({ n: count() }).from(clients).get()!.n;
  wiersze.push({ co: 'Klienci (po połączeniu, informacyjnie)', zrodlo: plan.klienci.length, baza: kl, pominiete: 0, roznica: null });
  wiersze.push({ co: 'Dni w harmonogramie (kolumna arkusza, informacyjnie)', zrodlo: plan.dni.arkusz, baza: plan.dni.przeniesione, pominiete: 0, roznica: null });
  return { wiersze, doPrzejrzenia: plan.doPrzejrzenia };
}

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** Lista „do przejrzenia” jako CSV (średnik, BOM – otwiera się w Excelu po polsku). */
export const reviewCsv = (r: Review[]): string =>
  `\uFEFF${['Arkusz;Wiersz;Dzień;Osoba;Tekst;Dotyczy;Przeniesiono;Opis', ...r.map((x) => [x.arkusz, x.wiersz ?? '', x.dzien ?? '', x.osoba, x.tekst, x.co, x.pominiete ? 'nie' : 'tak', x.opis].map(q).join(';'))].join('\r\n')}\r\n`;

/** Tabela raportu do konsoli. */
export function reportText(rep: Report): string {
  const rows = [['Co', 'Arkusz', 'Baza', 'Pominięte', 'Różnica'], ...rep.wiersze.map((w) => [w.co, String(w.zrodlo ?? '–'), String(w.baza), String(w.pominiete), w.roznica === null ? '–' : String(w.roznica)])];
  const width = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => (i ? c.padStart(width[i]!) : c.padEnd(width[i]!))).join('  ')).join('\n');
}
