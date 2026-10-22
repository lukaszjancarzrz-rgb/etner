import { toGr } from '@etner/shared';
import type { Rec } from '../../core/store.js';

const MAX_GR = 100_000_000_00;
/** Pole kwoty: grosze albo komunikat błędu. „12.500” (kropka + 3 cyfry) to prawie na pewno tysiące, nie grosze. */
export function parseZl(text: string): { gr: number } | { error: string } {
  if (/\.\d{3}(?!\d)/.test(text)) return { error: 'Użyj przecinka dla groszy, np. 12 500 albo 12500,00' };
  let gr: number;
  try { gr = toGr(text); } catch { return { error: 'Wpisz kwotę, np. 12 000 albo 12000,50' }; }
  if (gr < 0) return { error: 'Wpisz kwotę, np. 12 000 albo 12000,50' };
  if (gr > MAX_GR) return { error: 'Maksymalnie 100 000 000,00 zł' };
  return { gr };
}

/** Otwarty lead z terminem kontaktu na dziś lub wcześniej (jak `overdue` na serwerze). */
export const isOverdue = (l: Rec, group: string, today: string) => group !== 'zamkniete' && !!l.nastepny && l.nastepny <= today;

const byNext = (a: Rec, b: Rec) =>
  (a.nastepny || '9999') < (b.nastepny || '9999') ? -1 : (a.nastepny || '9999') > (b.nastepny || '9999') ? 1
    : String(b.numer ?? '').localeCompare(String(a.numer ?? ''), 'pl', { numeric: true });

/**
 * Lista leadów: „Zaległe kontakty” na górze (najstarszy termin pierwszy), potem Na już (aktualne), Na kiedyś (pozniej)
 * wg najbliższego terminu (bez terminu na końcu), Zamknięte od ostatnio zamkniętego.
 */
export function leadSections(leads: Rec[], group: (status: string) => string, today: string) {
  const out = { zalegle: [] as Rec[], aktualne: [] as Rec[], pozniej: [] as Rec[], zamkniete: [] as Rec[] };
  for (const l of leads) {
    const g = group(l.status);
    if (isOverdue(l, g, today)) out.zalegle.push(l);
    else (g === 'zamkniete' ? out.zamkniete : g === 'pozniej' ? out.pozniej : out.aktualne).push(l);
  }
  out.zalegle.sort(byNext);
  out.aktualne.sort(byNext);
  out.pozniej.sort(byNext);
  out.zamkniete.sort((a, b) => String(b.zamknieteAt ?? b.updatedAt ?? '').localeCompare(String(a.zamknieteAt ?? a.updatedAt ?? '')));
  return out;
}

/** Termin po zapisaniu kontaktu (jak serwer): nowy termin, inaczej minięty jest czyszczony, przyszły zostaje. */
export const nextAfterContact = (old: string, next: string, today: string) => next || (old && old <= today ? '' : old);

/** „Zrób zlecenie”: klient, obiekt i kategoria z leada, opis (albo temat) → pierwszy punkt zakresu, pierwszy status „aktualne”. */
export function jobPrefill(lead: Rec, statusy: Rec[]) {
  return {
    clientId: (lead.clientId as string | null) ?? '',
    siteId: (lead.siteId as string | null) ?? '',
    kategoria: (lead.kategoria as string) ?? '',
    status: (statusy.find((s) => (s.grupa ?? 'aktualne') === 'aktualne')?.wartosc as string | undefined) ?? '',
    scope: String(lead.opis || lead.temat || '').trim(),
  };
}
