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

/** Pozycja robocizny: osoba w miesiącu – dni z harmonogramu i godziny z Czasomierza, koszt. */
export type PozycjaRobocizny = { personId: string; miesiac: string; dni: number; godziny: number; koszt: number };
export type WynikZlecenia = { przychod: number; materialy: number; dni: number; godziny: number; robocizna: number; wynik: number; marza: number | null; pozycje: PozycjaRobocizny[] };

/** Koszt 1 dnia (albo 1 godziny) osoby w miesiącu (gr) – z Płac (place/model.ts kosztDnia / kosztGodziny). */
export type KosztDnia = ((personId: string, miesiac: string) => number) & { opis?: (personId: string, miesiac: string) => string };
/** Czasomierz do robocizny: wpisy czasu i koszt godziny osoby. */
export type CzasRobocizny = { wpisy: Rec[]; godzina: KosztDnia };

/**
 * Wynik zlecenia (gr): przychody netto (bez zwrotu VAT) − materiały (szacunek z przychodów) − robocizna.
 * Robocizna (C7): dni, w które osoba ma wpisy Czasomierza – godziny na zleceniu × koszt godziny; pozostałe dni – wpisy harmonogramu × koszt dnia.
 */
export function wynikZlecenia(jobId: string, revenues: Rec[], entries: Rec[], koszt: KosztDnia, czas?: CzasRobocizny): WynikZlecenia {
  const rev = revenues.filter((r) => live(r) && r.jobId === jobId && r.sposob !== 'zwrot');
  const przychod = rev.reduce((s, r) => s + (r.nettoGr as number), 0);
  const materialy = rev.reduce((s, r) => s + ((r.materialyGr as number | null) ?? 0), 0);
  const zCzasu = new Set((czas?.wpisy ?? []).filter((e) => live(e) && e.do).map((e) => `${e.personId}|${e.dzien}`));
  const wpisy = entries.filter((e) => live(e) && e.jobId === jobId && !zCzasu.has(`${e.personId}|${e.dzien}`));
  const dni = wpisy.reduce((s, e) => s + (e.polDnia ? 0.5 : 1), 0);
  const czasJob = (czas?.wpisy ?? []).filter((e) => live(e) && e.do && e.jobId === jobId);
  const h = (e: Rec) => (Date.parse(e.do) - Date.parse(e.od)) / 3_600_000;
  const godziny = czasJob.reduce((s, e) => s + h(e), 0);
  const poz = new Map<string, PozycjaRobocizny>();
  const at = (e: Rec) => { const k = `${e.personId}|${String(e.dzien).slice(0, 7)}`; let x = poz.get(k); if (!x) poz.set(k, x = { personId: e.personId as string, miesiac: String(e.dzien).slice(0, 7), dni: 0, godziny: 0, koszt: 0 }); return x; };
  for (const e of wpisy) { const x = at(e), w = e.polDnia ? 0.5 : 1; x.dni += w; x.koszt += w * koszt(x.personId, x.miesiac); }
  for (const e of czasJob) { const x = at(e); x.godziny += h(e); x.koszt += h(e) * czas!.godzina(x.personId, x.miesiac); }
  const pozycje = [...poz.values()].sort((a, b) => a.miesiac.localeCompare(b.miesiac) || b.koszt - a.koszt);
  const robocizna = Math.round(pozycje.reduce((s, x) => s + x.koszt, 0));
  const wynik = przychod - materialy - robocizna;
  return { przychod, materialy, dni, godziny, robocizna, wynik, marza: przychod ? wynik / przychod : null, pozycje };
}

/** Wiersz zakładki „Wyniki zleceń”: wynik + miesiąc zlecenia, roboczodni i wynik na roboczodzień. */
export type WierszZlecenia = WynikZlecenia & { job: Rec; miesiac: string; bezFaktury: boolean; roboczodni: number; naDzien: number | null; pierwszyDzien: string | null; ostatniDzien: string | null };

/**
 * Wyniki zleceń w okresie (RRRR-MM od–do, właściciel 2026-11-20): miesiąc zlecenia wg faktury (ostatni miesiąc przychodu) albo wg ostatniego dnia pracy.
 * Zlecenia zamknięte bez faktury też (przychód 0, „brak faktury”; miesiąc = ostatni dzień pracy). Roboczodni = dni z harmonogramu + godziny z Czasomierza ÷ godziny dnia.
 */
export function wynikiOkresu(jobs: Rec[], revenues: Rec[], entries: Rec[], koszt: KosztDnia, czas: CzasRobocizny | undefined,
  o: { od: string; do: string; wg: 'faktura' | 'praca'; zamkniete: (job: Rec) => boolean; godzDnia: (miesiac: string) => number }): WierszZlecenia[] {
  const rev = new Map<string, string[]>(), dni = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const r of revenues) { const mm = live(r) && r.jobId && r.sposob !== 'zwrot' ? miesiacWiersza(r) : null; if (mm) add(rev, r.jobId as string, mm); }
  for (const e of entries) if (live(e) && e.jobId) add(dni, e.jobId as string, String(e.dzien));
  for (const e of czas?.wpisy ?? []) if (live(e) && e.jobId && e.do) add(dni, e.jobId as string, String(e.dzien));
  const out: WierszZlecenia[] = [];
  for (const job of jobs) {
    if (!live(job)) continue;
    const ms = rev.get(job.id as string) ?? [], ds = (dni.get(job.id as string) ?? []).sort();
    const ostatni = ds.at(-1) ?? null, bezFaktury = !ms.length;
    if (bezFaktury && (!ostatni || !o.zamkniete(job))) continue;
    const miesiac = bezFaktury || (o.wg === 'praca' && ostatni) ? ostatni!.slice(0, 7) : ms.sort().at(-1)!;
    if (miesiac < o.od || miesiac > o.do) continue;
    const w = wynikZlecenia(job.id as string, revenues, entries, koszt, czas);
    const roboczodni = w.pozycje.reduce((s, x) => s + x.dni + x.godziny / o.godzDnia(x.miesiac), 0);
    out.push({ ...w, job, miesiac, bezFaktury, roboczodni, naDzien: roboczodni ? w.wynik / roboczodni : null, pierwszyDzien: ds[0] ?? null, ostatniDzien: ostatni });
  }
  return out;
}

