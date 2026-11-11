import { isWorkday, parametryMiesiaca, type Forma, type Parametry } from '@etner/shared';
import type { Rec } from '../../core/store.js';

/** Płace: liczenie jak w arkuszu (Rozliczenie miesiąca, Statystyki urlopów, Podsumowanie płac). Kwoty w groszach. */

const live = (r: Rec) => !r.deletedAt;
export const MIESIACE = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const ostatniDzien = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dniMiesiaca = (m: string) => Array.from({ length: Number(ostatniDzien(m).slice(8)) }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);

export interface Dane {
  people: Rec[]; // schedule_people
  osoby: Rec[]; // payroll_people
  stawki: Rec[]; // payroll_rates
  miesiace: Rec[]; // payroll_months
  wpisy: Rec[]; // payroll_entries
  entries: Rec[]; // schedule_entries
  parametry: Record<string, Parametry>;
  dzis: string; // RRRR-MM-DD
  dniWolne: string[]; // dodatkowe dni wolne firmy
}

// ---------- kalkulator umowy (Parametry, wiersze 24–31) ----------
export type Kalkulator = { spoleczne: number; zdrowotna: number; pit: number; netto: number; zusPracodawcy: number; kosztPracodawcy: number; kosztUmowy: number };

/** ZUS, zdrowotna i PIT z brutto (gr); kosztUmowy = koszt pracodawcy − netto. Zaokrąglenia jak w arkuszu (składki do grosza, podstawa i PIT do złotego). */
export function kalkulatorUmowy(bruttoGr: number, forma: Forma, kupGr: number | null, p: Parametry): Kalkulator {
  const b = bruttoGr;
  if (!b || (forma !== 'uop' && forma !== 'zlecenie')) return { spoleczne: 0, zdrowotna: 0, pit: 0, netto: 0, zusPracodawcy: 0, kosztPracodawcy: 0, kosztUmowy: 0 };
  const r = (x: number) => Math.round(x);
  const zl = (x: number) => Math.round(x / 100) * 100;
  const spoleczne = r(b * p.emP) + r(b * p.rentP) + r(b * p.chor);
  const zdrowotna = r((b - spoleczne) * p.zdr);
  const kup = forma === 'zlecenie' ? r((b - spoleczne) * p.kupZl) : kupGr ?? p.kupGr;
  const pit = Math.max(0, zl(zl(Math.max(0, b - spoleczne - kup)) * p.pit - p.kwotaZmnGr));
  const netto = b - spoleczne - zdrowotna - pit;
  const zusPracodawcy = r(b * p.emF) + r(b * p.rentF) + r(b * p.wyp) + (b >= p.placaMinGr ? r(b * p.fp) : 0) + r(b * p.fgsp);
  const kosztPracodawcy = b + zusPracodawcy;
  return { spoleczne, zdrowotna, pit, netto, zusPracodawcy, kosztPracodawcy, kosztUmowy: kosztPracodawcy - netto };
}

// ---------- harmonogram: nieobecności i dni pracy ----------
export type Nieobecnosc = 'wypoczynkowy' | 'naZadanie' | 'L4' | 'okolicznosciowy' | 'bezplatny';

/** Rodzaj nieobecności z kodu (albo tekstu) wpisu – jak COUNTIFS w arkuszu „Statystyki urlopów”. */
export function rodzajNieobecnosci(kod: string | null | undefined): Nieobecnosc | null {
  const k = String(kod ?? '').trim().toLowerCase();
  if (k.startsWith('urlop b') || k.startsWith('bezpł') || k === 'x') return 'bezplatny';
  if (k.startsWith('urlop o') || k.startsWith('okol')) return 'okolicznosciowy';
  if (k.startsWith('urlop n') || k.startsWith('na ż') || k === 'uż') return 'naZadanie';
  if (k.startsWith('urlop')) return 'wypoczynkowy';
  if (k.startsWith('l4')) return 'L4';
  return null;
}
const kodWpisu = (e: Rec) => (e.rodzaj === 'kod' ? e.kod : e.rodzaj === 'tekst' ? e.tekst : null) as string | null;
const waga = (e: Rec) => (e.polDnia ? 0.5 : 1);

/** Dzień pracy w harmonogramie: wpis, który nie jest nieobecnością ani „wolne” (także soboty). */
export const czyDzienPracy = (e: Rec): boolean => !rodzajNieobecnosci(kodWpisu(e)) && String(kodWpisu(e) ?? '').trim().toLowerCase() !== 'wolne';

/** Dni robocze miesiąca (bez weekendów i świąt). */
export const dniRobocze = (m: string, dniWolne: string[]): number => dniMiesiaca(m).filter((d) => isWorkday(d, dniWolne) === 1).length;

type Nieob = Record<Nieobecnosc, number>;
const zeroN = (): Nieob => ({ wypoczynkowy: 0, naZadanie: 0, L4: 0, okolicznosciowy: 0, bezplatny: 0 });

export interface UrlopOsoby {
  personId: string; limit: number;
  /** [12] nieobecności w miesiącach (dni robocze). */ mies: Nieob[];
  /** [12] płatne dni urlopu (po kolei do limitu). */ platne: number[];
  /** [12] dni pracy wg harmonogramu. */ dniPracy: number[];
  wykorzystany: number; platneRazem: number; darmowe: number; pozostalo: number; ustawowy: number | null;
}

// ---------- przygotowanie danych (pamięć podręczna na jedno liczenie) ----------
export function przygotuj(d: Dane) {
  const osoby = new Map(d.osoby.filter(live).map((o) => [o.personId as string, o]));
  const kolej = new Map(d.people.map((p) => [p.id as string, p]));
  const lista = [...osoby.values()].sort((a, b) => ((kolej.get(a.personId)?.kolejnosc ?? 0) - (kolej.get(b.personId)?.kolejnosc ?? 0)));
  const mies = new Map(d.miesiace.filter(live).map((r) => [`${r.personId}|${r.miesiac}`, r]));
  const stawki = d.stawki.filter(live);
  const wpisy = d.wpisy.filter(live);
  const entries = d.entries.filter(live);
  const urlopy = new Map<string, Map<string, UrlopOsoby>>();
  const nazwa = (personId: string) => (kolej.get(personId)?.nazwa as string | undefined) ?? '?';

  function stawka(personId: string, m: string): number {
    let best: Rec | undefined;
    for (const s of stawki) if (s.personId === personId && s.odMiesiaca <= m && (!best || s.odMiesiaca > best.odMiesiaca)) best = s;
    return (best?.stawkaGr as number | undefined) ?? 0;
  }

  /** Urlopy i dni pracy osób w roku (liczone raz na rok). */
  function urlopyRoku(rok: string): Map<string, UrlopOsoby> {
    const got = urlopy.get(rok);
    if (got) return got;
    const out = new Map<string, UrlopOsoby>();
    const wiersz = (personId: string) => {
      let u = out.get(personId);
      if (!u) {
        const o = osoby.get(personId);
        u = { personId, limit: Number(o?.urlopDni ?? 0), mies: MIESIACE.map(zeroN), platne: [], dniPracy: MIESIACE.map(() => 0), wykorzystany: 0, platneRazem: 0, darmowe: 0, pozostalo: 0, ustawowy: null };
        out.set(personId, u);
      }
      return u;
    };
    for (const o of lista) wiersz(o.personId as string);
    for (const e of entries) {
      if (!String(e.dzien).startsWith(rok)) continue;
      const i = Number(String(e.dzien).slice(5, 7)) - 1;
      const n = rodzajNieobecnosci(kodWpisu(e));
      if (n) { if (isWorkday(e.dzien as string, d.dniWolne) === 1) wiersz(e.personId as string).mies[i]![n] += waga(e); }
      else if (czyDzienPracy(e)) wiersz(e.personId as string).dniPracy[i]! += waga(e);
    }
    const p = parametryMiesiaca(d.parametry, rok);
    for (const u of out.values()) {
      let cum = 0;
      u.platne = u.mies.map((n) => { const prev = Math.min(cum, u.limit); cum += n.wypoczynkowy + n.naZadanie; return Math.min(cum, u.limit) - prev; });
      u.wykorzystany = cum; u.platneRazem = u.platne.reduce((a, b) => a + b, 0); u.darmowe = cum - u.platneRazem; u.pozostalo = u.limit - u.platneRazem;
      const o = osoby.get(u.personId);
      if (o?.forma === 'uop') {
        const od = o.umowaOd && o.umowaOd > `${rok}-01-01` ? Number(String(o.umowaOd).slice(5, 7)) : 1;
        const doo = o.umowaDo && o.umowaDo < `${rok}-12-31` ? Number(String(o.umowaDo).slice(5, 7)) : 12;
        const poza = (o.umowaDo && o.umowaDo < `${rok}-01-01`) || (o.umowaOd && o.umowaOd > `${rok}-12-31`);
        u.ustawowy = poza ? 0 : Math.ceil((o.staz10 ? p.urlopMax : p.urlopMin) * Number(o.etat ?? 1) * Math.max(0, doo - od + 1) / 12);
      }
    }
    urlopy.set(rok, out);
    return out;
  }

  /** Koszt umowy osoby w miesiącu: ręczna zmiana → koszt ręczny osoby → kalkulator; tylko w okresie umowy i do bieżącego miesiąca. */
  function kosztUmowy(personId: string, m: string): number {
    const zm = mies.get(`${personId}|${m}`)?.kosztUmowyGr as number | null | undefined;
    if (zm != null) return zm;
    const o = osoby.get(personId);
    if (!o || o.forma === 'brak' || `${m}-01` > d.dzis) return 0;
    if ((o.umowaOd && o.umowaOd > ostatniDzien(m)) || (o.umowaDo && o.umowaDo < `${m}-01`)) return 0;
    if (o.kosztRecznyGr != null) return o.kosztRecznyGr as number;
    return kalkulatorUmowy(Number(o.bruttoGr ?? 0), o.forma as Forma, (o.kupGr as number | null) ?? null, parametryMiesiaca(d.parametry, m)).kosztUmowy;
  }

  return { lista, osoby, mies, wpisy, entries, stawka, urlopyRoku, kosztUmowy, nazwa };
}
export type Przygotowane = ReturnType<typeof przygotuj>;

// ---------- rozliczenie miesiąca ----------
export interface WierszRozliczenia {
  personId: string; nazwa: string; forma: Forma; godziny: number; stawka: number; wyplata: number; urlopDni: number; urlop: number; premie: number;
  nalezne: number; zaliczki: number; przelewy: number; doWyplaty: number; kosztUmowy: number; inne: number; koszt: number;
  darmoweDni: number; inneNieobecnosci: number; dniPracy: number;
}

export function wierszRozliczenia(P: Przygotowane, d: Dane, personId: string, m: string): WierszRozliczenia {
  const o = P.osoby.get(personId);
  const i = Number(m.slice(5, 7)) - 1;
  const u = P.urlopyRoku(m.slice(0, 4)).get(personId);
  const godziny = Number(P.mies.get(`${personId}|${m}`)?.godziny ?? 0);
  const stawka = P.stawka(personId, m);
  const p = parametryMiesiaca(d.parametry, m);
  const suma = (rodzaj: string) => P.wpisy.filter((w) => w.personId === personId && w.miesiac === m && w.rodzaj === rodzaj).reduce((s, w) => s + (w.kwotaGr as number), 0);
  const wyplata = Math.round(godziny * stawka);
  const urlopDni = u?.platne[i] ?? 0;
  const urlop = Math.round(urlopDni * p.godzUrlop * stawka);
  const premie = suma('premia'), zaliczki = suma('zaliczka'), przelewy = suma('przelew'), inne = suma('inny');
  const nalezne = wyplata + urlop + premie;
  const kosztUmowy = P.kosztUmowy(personId, m);
  const n = u?.mies[i] ?? zeroN();
  return {
    personId, nazwa: P.nazwa(personId), forma: (o?.forma ?? 'brak') as Forma, godziny, stawka, wyplata, urlopDni, urlop, premie, nalezne, zaliczki, przelewy,
    doWyplaty: nalezne - zaliczki - przelewy, kosztUmowy, inne, koszt: nalezne + kosztUmowy + inne,
    darmoweDni: n.wypoczynkowy + n.naZadanie - urlopDni, inneNieobecnosci: n.L4 + n.okolicznosciowy + n.bezplatny, dniPracy: u?.dniPracy[i] ?? 0,
  };
}

const SUMY = ['godziny', 'wyplata', 'urlopDni', 'urlop', 'premie', 'nalezne', 'zaliczki', 'przelewy', 'doWyplaty', 'kosztUmowy', 'inne', 'koszt', 'darmoweDni', 'inneNieobecnosci', 'dniPracy'] as const;
export type Sumy = Record<(typeof SUMY)[number], number>;
export const zsumuj = (rows: Pick<WierszRozliczenia, (typeof SUMY)[number]>[]): Sumy =>
  Object.fromEntries(SUMY.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)])) as Sumy;

/** Rozliczenie miesiąca: wiersz na osobę z płac + razem. */
export function rozliczenieMiesiaca(d: Dane, m: string, P = przygotuj(d)) {
  const wiersze = P.lista.map((o) => wierszRozliczenia(P, d, o.personId as string, m));
  return { wiersze, razem: zsumuj(wiersze) };
}

/** Czy miesiąc ma dane płac (godziny, premie albo inne koszty; zaliczka to nie koszt) – wtedy koszty pracowników w Wyniku liczą się z Płac. */
export const maDanePlac = (P: Przygotowane, m: string): boolean =>
  [...P.mies.values()].some((r) => r.miesiac === m && Number(r.godziny ?? 0) > 0) || P.wpisy.some((w) => w.miesiac === m && (w.rodzaj === 'premia' || w.rodzaj === 'inny'));

/** Podsumowanie roku: miesiące (sumy wszystkich osób) i osoby (sumy roku); koszt 1 h = koszt ÷ godziny przepracowane. */
export function podsumowanieRoku(d: Dane, rok: string, P = przygotuj(d)) {
  const siatka = P.lista.map((o) => MIESIACE.map((mm) => wierszRozliczenia(P, d, o.personId as string, `${rok}-${mm}`)));
  const miesiace = MIESIACE.map((mm, i) => ({ miesiac: `${rok}-${mm}`, ...zsumuj(siatka.map((r) => r[i]!)) }));
  const osoby = siatka.map((r, j) => ({ personId: P.lista[j]!.personId as string, nazwa: r[0]!.nazwa, forma: r[0]!.forma, ...zsumuj(r) }));
  const razem = zsumuj(miesiace);
  const h1 = (s: Sumy) => (s.godziny ? Math.round(s.koszt / s.godziny) : null);
  return { miesiace: miesiace.map((m) => ({ ...m, koszt1h: h1(m) })), osoby: osoby.map((o) => ({ ...o, koszt1h: h1(o) })), razem: { ...razem, koszt1h: h1(razem) } };
}

/** Koszty pracowników do Wyniku firmy: RRRR-MM → gr, tylko miesiące z danymi płac. */
export function kosztyPracownikowMiesiecy(d: Dane, rok: string, P = przygotuj(d)): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mm of MIESIACE) {
    const m = `${rok}-${mm}`;
    if (maDanePlac(P, m)) out[m] = rozliczenieMiesiaca(d, m, P).razem.koszt;
  }
  return out;
}

// ---------- robocizna zlecenia (pełny koszt firmy, decyzja D4) ----------
/** Koszt 1 dnia osoby w miesiącu (gr): koszt całkowity ÷ dni pracy z harmonogramu; bez godzin: (stawka + koszt umowy ÷ wymiar) × godziny dnia; bez stawki: stawka osobodnia. */
export function kosztDnia(d: Dane, stawkaOsobodniaGr: number, P = przygotuj(d)) {
  const memo = new Map<string, number>();
  return (personId: string, m: string): number => {
    const k = `${personId}|${m}`;
    let v = memo.get(k);
    if (v !== undefined) return v;
    const r = P.osoby.has(personId) ? wierszRozliczenia(P, d, personId, m) : null;
    const p = parametryMiesiaca(d.parametry, m);
    if (r && r.stawka > 0 && r.godziny > 0 && r.dniPracy > 0) v = Math.round(r.koszt / r.dniPracy);
    else if (r && r.stawka > 0) {
      const wymiar = p.godzDnia * dniRobocze(m, d.dniWolne) * Number(P.osoby.get(personId)?.etat ?? 1);
      v = Math.round((r.stawka + (wymiar ? r.kosztUmowy / wymiar : 0)) * p.godzDnia);
    } else v = stawkaOsobodniaGr;
    memo.set(k, v);
    return v;
  };
}

/** Robocizna zlecenia (gr): Σ wpisów harmonogramu (½ dnia = 0,5) × koszt dnia osoby w danym miesiącu. */
export const robociznaZlecenia = (jobId: string, entries: Rec[], koszt: (personId: string, m: string) => number): number =>
  Math.round(entries.filter((e) => live(e) && e.jobId === jobId).reduce((s, e) => s + waga(e) * koszt(e.personId as string, String(e.dzien).slice(0, 7)), 0));
