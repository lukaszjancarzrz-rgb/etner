import { miesiacPrzychodu } from '@etner/shared';
import type { Rec } from '../../core/store.js';

const live = (r: Rec) => !r.deletedAt;

/** Miesiąc (RRRR-MM) wiersza: koszt ma `miesiac`, przychód liczy się z daty albo „innego miesiąca”. */
export const miesiacWiersza = (r: Rec): string | null => (r.miesiac as string | undefined) ?? miesiacPrzychodu(r.dzien ?? null, r.innyMiesiac ?? null);

/** Czy wiersz mieści się w okresie: `okres` to RRRR-MM albo RRRR (cały rok). */
export const wOkresie = (r: Rec, okres: string): boolean => !!miesiacWiersza(r)?.startsWith(okres);

/** Suma netto (gr) nieusuniętych wierszy z danego miesiąca (RRRR-MM) albo roku (RRRR). */
export const sumaMiesiaca = (rows: Rec[], miesiac: string): number =>
  rows.filter((r) => live(r) && wOkresie(r, miesiac)).reduce((s, r) => s + (r.nettoGr as number), 0);

/** Zlecenia ze statusem „Rozliczone” (bez względu na wielkość liter) bez żadnego nieusuniętego przychodu. */
export function rozliczoneBezPrzychodu(jobs: Rec[], revenues: Rec[]): Rec[] {
  const z = new Set(revenues.filter((r) => live(r) && r.jobId).map((r) => r.jobId as string));
  return jobs.filter((j) => live(j) && String(j.status ?? '').trim().toLowerCase() === 'rozliczone' && !z.has(j.id));
}


const MIESIACE = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

export type MiesiacWyniku = {
  miesiac: string; zFaktura: number; bezFaktury: number; przychod: number; kosztyFirmy: number; kosztyPracownikow: number;
  koszty: number; wynik: number; narastajaco: number; marza: number | null; zlecen: number; srednia: number | null; zwrotVat: number; wynikZeZwrotem: number;
};

/** Wynik firmy rok po miesiącu (gr) jak arkusz „Wyniki firmy”; ostatni element = razem w roku. */
export function wynikRoku(revenues: Rec[], costs: Rec[], place: Record<string, number>, rok: string): MiesiacWyniku[] {
  let nar = 0;
  const rows = MIESIACE.map((mm) => {
    const m = `${rok}-${mm}`;
    const rev = revenues.filter((r) => live(r) && miesiacWiersza(r) === m);
    const sum = (f: (r: Rec) => boolean) => rev.filter(f).reduce((s, r) => s + (r.nettoGr as number), 0);
    const zFaktura = sum((r) => r.sposob === 'vat8' || r.sposob === 'vat23');
    const bezFaktury = sum((r) => r.sposob === 'bez');
    const zwrotVat = sum((r) => r.sposob === 'zwrot');
    const kosztyFirmy = costs.filter((c) => live(c) && c.doWyniku && c.miesiac === m).reduce((s, c) => s + (c.nettoGr as number), 0);
    // jedno zlecenie rozliczone gotówką i fakturą to dwa przychody – liczymy je raz
    const zlecen = new Set(rev.filter((r) => r.sposob !== 'zwrot').map((r) => (r.jobId as string | null) ?? `${r.klient}|${r.dzien}`)).size;
    const przychod = zFaktura + bezFaktury, kosztyPracownikow = place[m] ?? 0, koszty = kosztyFirmy + kosztyPracownikow, wynik = przychod - koszty;
    nar += wynik;
    return { miesiac: m, zFaktura, bezFaktury, przychod, kosztyFirmy, kosztyPracownikow, koszty, wynik, narastajaco: nar, marza: przychod ? wynik / przychod : null,
      zlecen, srednia: zlecen ? Math.round(przychod / zlecen) : null, zwrotVat, wynikZeZwrotem: wynik + zwrotVat };
  });
  rows.push(sumaOkresu(rows, rok));
  return rows;
}

/** Suma miesięcy (wybrany okres albo cały rok): kwoty i zlecenia sumowane, marża i średnia liczone z sum. */
export function sumaOkresu(rows: MiesiacWyniku[], miesiac: string): MiesiacWyniku {
  const t = (k: keyof MiesiacWyniku) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const przychod = t('przychod'), wynik = t('wynik'), zlecen = t('zlecen');
  return { miesiac, zFaktura: t('zFaktura'), bezFaktury: t('bezFaktury'), przychod, kosztyFirmy: t('kosztyFirmy'), kosztyPracownikow: t('kosztyPracownikow'),
    koszty: t('koszty'), wynik, narastajaco: wynik, marza: przychod ? wynik / przychod : null, zlecen, srednia: zlecen ? Math.round(przychod / zlecen) : null,
    zwrotVat: t('zwrotVat'), wynikZeZwrotem: t('wynikZeZwrotem') };
}

export const KPIR_KOL = [['przychod', 'Przychód (kol. 9)'], ['towary', 'Towary (kol. 12)'], ['uboczne', 'Koszty uboczne (kol. 13)'], ['wynagrodzenia', 'Wynagrodzenia (kol. 14)'], ['pozostale', 'Pozostałe (kol. 15)']] as const;
export type KpirKol = (typeof KPIR_KOL)[number][0];

/** Kontrola KPiR: miesiące roku z księgą albo danymi; „w aplikacji” = przychód z fakturą netto i koszty wg kolumny KPiR. */
export function kontrolaKpir(kpir: Rec[], revenues: Rec[], costs: Rec[], rok: string) {
  const KOL: Record<number, KpirKol> = { 12: 'towary', 13: 'uboczne', 14: 'wynagrodzenia', 15: 'pozostale' };
  return MIESIACE.map((mm) => {
    const m = `${rok}-${mm}`;
    const k = kpir.find((r) => live(r) && r.miesiac === m);
    const app = { przychod: 0, towary: 0, uboczne: 0, wynagrodzenia: 0, pozostale: 0 } as Record<KpirKol, number>;
    for (const r of revenues) if (live(r) && miesiacWiersza(r) === m && (r.sposob === 'vat8' || r.sposob === 'vat23')) app.przychod += r.nettoGr as number;
    for (const c of costs) if (live(c) && c.miesiac === m && KOL[c.kolumnaKpir as number]) app[KOL[c.kolumnaKpir as number]!] += c.nettoGr as number;
    const ksiega = k ? { przychod: k.przychodGr, towary: k.towaryGr, uboczne: k.uboczneGr, wynagrodzenia: k.wynagrodzeniaGr, pozostale: k.pozostaleGr } as Record<KpirKol, number> : null;
    return { miesiac: m, ksiega, app, pusty: !k && Object.values(app).every((v) => !v) };
  }).filter((r) => !r.pusty);
}

/** Statystyki: osobodni z harmonogramu w roku wg branży, ekipy i branża × ekipa (½ dnia = 0,5). */
export function statystyki(entries: Rec[], jobs: Rec[], rok: string) {
  const job = new Map(jobs.filter(live).map((j) => [j.id as string, j]));
  const add = (m: Map<string, { dni: number; zlecenia: Set<string> }>, k: string, id: string, d: number) => {
    const v = m.get(k) ?? { dni: 0, zlecenia: new Set<string>() };
    v.dni += d; v.zlecenia.add(id); m.set(k, v);
  };
  const kat = new Map<string, { dni: number; zlecenia: Set<string> }>(), eki = new Map<string, { dni: number; zlecenia: Set<string> }>(), krzyz = new Map<string, number>();
  let razem = 0;
  for (const e of entries) {
    if (!live(e) || !e.jobId || !String(e.dzien).startsWith(rok)) continue;
    const j = job.get(e.jobId as string);
    if (!j) continue;
    const d = e.polDnia ? 0.5 : 1, k = (j.kategoria as string) || 'Bez branży', ek = (j.ekipa as string) || 'Bez ekipy';
    add(kat, k, j.id as string, d); add(eki, ek, j.id as string, d);
    krzyz.set(`${k}\u0000${ek}`, (krzyz.get(`${k}\u0000${ek}`) ?? 0) + d);
    razem += d;
  }
  const rows = (m: typeof kat) => [...m].map(([nazwa, v]) => ({ nazwa, zlecen: v.zlecenia.size, dni: v.dni, srednio: v.dni / v.zlecenia.size, udzial: razem ? v.dni / razem : 0 })).sort((a, b) => b.dni - a.dni);
  return { kategorie: rows(kat), ekipy: rows(eki), krzyz, razem };
}

export type WynikZlecenia = { przychod: number; materialy: number; dni: number; robocizna: number; wynik: number; marza: number | null };

/** Koszt 1 dnia osoby w miesiącu (gr) – z Płac (place/model.ts kosztDnia). */
export type KosztDnia = (personId: string, miesiac: string) => number;

/** Wynik zlecenia (gr): przychody netto (bez zwrotu VAT) − materiały (szacunek z przychodów) − robocizna (dni z harmonogramu × koszt dnia osoby z Płac). */
export function wynikZlecenia(jobId: string, revenues: Rec[], entries: Rec[], koszt: KosztDnia): WynikZlecenia {
  const rev = revenues.filter((r) => live(r) && r.jobId === jobId && r.sposob !== 'zwrot');
  const przychod = rev.reduce((s, r) => s + (r.nettoGr as number), 0);
  const materialy = rev.reduce((s, r) => s + ((r.materialyGr as number | null) ?? 0), 0);
  const wpisy = entries.filter((e) => live(e) && e.jobId === jobId);
  const dni = wpisy.reduce((s, e) => s + (e.polDnia ? 0.5 : 1), 0);
  const robocizna = Math.round(wpisy.reduce((s, e) => s + (e.polDnia ? 0.5 : 1) * koszt(e.personId as string, String(e.dzien).slice(0, 7)), 0)), wynik = przychod - materialy - robocizna;
  return { przychod, materialy, dni, robocizna, wynik, marza: przychod ? wynik / przychod : null };
}

/** Zlecenia z przychodem w danym roku (miesiąc przychodu) z ich wynikiem. */
export function wynikiZlecen(jobs: Rec[], revenues: Rec[], entries: Rec[], koszt: KosztDnia, rok: string) {
  const ids = new Set(revenues.filter((r) => live(r) && r.jobId && r.sposob !== 'zwrot' && miesiacWiersza(r)?.startsWith(rok)).map((r) => r.jobId as string));
  return jobs.filter((j) => live(j) && ids.has(j.id as string)).map((job) => ({ job, ...wynikZlecenia(job.id as string, revenues, entries, koszt) }));
}
