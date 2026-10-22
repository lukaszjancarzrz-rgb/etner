import type { Rec } from '../../core/store.js';

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
