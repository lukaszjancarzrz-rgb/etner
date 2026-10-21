export type ClientDraft = { typ: 'osoba' | 'firma'; nazwa: string; telefony: string[]; emaile: string[]; nip: string; notatki: string };

/** Formularz klienta → ciało PUT i błędy przy polach (`email.<i>` = wiersz e-maila). Puste wiersze list są pomijane. */
export function clientBody(f: ClientDraft): { body: ClientDraft; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const nazwa = f.nazwa.trim();
  if (!nazwa) errors.nazwa = 'Podaj nazwę klienta';
  f.emaile.forEach((m, i) => { if (m.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.trim())) errors[`email.${i}`] = 'Niepoprawny adres e-mail'; });
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return { body: { typ: f.typ, nazwa, telefony: clean(f.telefony), emaile: clean(f.emaile), nip: f.nip.trim(), notatki: f.notatki.trim() }, errors };
}
