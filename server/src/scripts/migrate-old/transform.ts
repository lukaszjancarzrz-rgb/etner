import type { DictGrupa, DictRodzaj } from '@etner/shared';
import { norm, phoneDigits } from '../../modules/klienci/service.js';
import { SHEETS as SHEET } from './layout.js';
import type { OldData, OldJob, OldLead } from './old-data.js';

/** Grupa raportu (źródło / baza / pominięte). */
export type Co = 'zlecenia' | 'wyceny' | 'historia' | 'harmonogram' | 'uwagi' | 'zadania' | 'zakupy' | 'osoby';
/**
 * Pozycja „do przejrzenia”; `pominiete` = nie przeniesiono (liczy się do różnicy źródło – baza), inaczej przeniesiono z uwagą.
 * Komórka harmonogramu: `dzien`, `osoba`, `tekst` = treść komórki z arkusza.
 */
export type Review = { co: Co | 'klienci'; arkusz: string; wiersz: number | null; dzien: string | null; osoba: string; tekst: string; opis: string; ile: number; pominiete: boolean };

export type PlanClient = { nazwa: string; typ: 'osoba' | 'firma'; telefony: string[]; emaile: string[]; notatki: string; obiekty: string[] };
export type PlanJob = { klient: number; obiekt: string | null; lead: number | null; status: string; kategoria: string; termin: string | null; ekipa: string | null; zakres: string; uwagiAdmin: string; zamknieto: string | null };
/** Kontakt z Historii: `status` = status leada w chwili kontaktu, `plan` = zaplanowany termin, `zapisano` = chwila zapisu (ISO) albo null. */
export type PlanContact = { dzien: string; notatka: string; nastepny: string; status: string; plan: string; zapisano: string | null };
export type PlanLead = { klient: number | null; obiekt: string | null; status: string; kategoria: string; temat: string; zrodlo: string; opis: string; wartoscGr: number | null; nastepny: string; uwagi: string; zamknieto: string | null; kontakty: PlanContact[] };
type SlotBody = { rodzaj: 'zlecenie'; zlecenie: number } | { rodzaj: 'kod'; kod: string } | { rodzaj: 'tekst'; tekst: string };
export type PlanSlot = SlotBody & { polDnia: boolean };
export type PlanTask = { tekst: string; priorytet: number | null; grupa: string; status: string; termin: string | null; cykliczne: boolean; uwagi: string };
export type PlanBuy = { co: string; uwagi: string; kupione: boolean; kupiono: string | null };
export type DictAdd = { rodzaj: DictRodzaj; wartosc: string; grupa?: DictGrupa | null; platne?: boolean | null };

export type Plan = {
  slowniki: DictAdd[];
  klienci: PlanClient[];
  zlecenia: PlanJob[];
  leady: PlanLead[];
  osoby: { nazwa: string; login: string; ekipa: string | null }[];
  harmonogram: { dzien: string; osoba: number; sloty: PlanSlot[] }[];
  uwagiDnia: { dzien: string; tekst: string }[];
  zadania: PlanTask[];
  zakupy: PlanBuy[];
  /** Liczby wierszy / komórek w arkuszu. */
  zrodlo: Record<Co, number>;
  /** Suma kolumny „Dni w harmonogramie” i ta sama liczba po przeniesieniu (komórki z zleceniem + komórki osób spoza płac z hasłem). */
  dni: { arkusz: number; przeniesione: number };
  doPrzejrzenia: Review[];
};

/** Decyzja właściciela 2026-10-28: kody arkusza → nazwy kategorii (zadanie 19i); H (hydraulika) → Inne. */
export const KATEGORIE: Record<string, string> = {
  E: 'Elektryka', RW: 'Rekuperacja', K: 'Klimatyzacja', AM: 'Alarmy i monitoring', SH: 'Smart home', S: 'Sprzedaż', I: 'Inne', H: 'Inne',
};
/** Nazwy arkusza o tym samym znaczeniu co wartość słownika aplikacji (używane, gdy w słowniku nie ma nazwy z arkusza). */
const ALIAS: Partial<Record<DictRodzaj, Record<string, string>>> = {
  status_zlecenia: { planowane: 'Zaplanowane' },
  status_leada: { 'na pozniej': 'Na kiedyś' },
  kod_nieobecnosci: { 'na zadanie': 'UŻ' },
};
/** Grupa statusu dopisywanego do słownika = grupa sekcji arkusza, w której stoi wiersz. */
const SEKCJA_GRUPA: Record<string, DictGrupa> = {
  AKTUALNE: 'aktualne', 'NA JUŻ': 'aktualne', 'NA PÓŹNIEJ': 'pozniej', 'NA KIEDYŚ': 'pozniej', 'ZAKOŃCZONE': 'zamkniete', 'ZAMKNIĘTE': 'zamkniete',
};
/** Kody arkusza po początku tekstu (jak liczy arkusz); „x” = bezpłatny. Kody ze słownika aplikacji – tylko cała komórka. */
const KODY: [string, string][] = [
  ['urlop n', 'na żądanie'], ['urlop o', 'okolicznościowy'], ['urlop b', 'bezpłatny'], ['urlop', 'urlop'], ['na ż', 'na żądanie'],
  ['l4', 'L4'], ['okoli', 'okolicznościowy'], ['bezpł', 'bezpłatny'], ['wolne', 'wolne'],
];
const KOD_PLATNE: Record<string, boolean> = { 'na żądanie': true, okolicznościowy: true, bezpłatny: false };
const MIESIACE = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'];
const ZAKUP_STATUS = new Set(['', 'do kupienia', 'zamowione', 'kupione']);

const plDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const has = (a: string, b: string) => !!b && norm(a).includes(norm(b));
const surname = (s: string) => norm(s).split(' ').at(-1) ?? '';
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const join = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join('; ');
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
/** `h` w `s` jako całe słowo/słowa (oba już po norm), np. „lis” w „u lis” tak, w „kalisz” nie. */
export function wordHit(s: string, h: string): boolean {
  for (let i = s.indexOf(h); i >= 0; i = s.indexOf(h, i + 1)) if (!isWordChar(s[i - 1]) && !isWordChar(s[i + h.length])) return true;
  return false;
}

/** „październik 2026” → 2026-10; „kiedyś” i puste → null; nieczytelne → undefined. */
export function termin(s: string): string | null | undefined {
  const m = /^(\p{L}+)\s+(\d{4})$/u.exec(norm(s));
  const i = m ? MIESIACE.indexOf(m[1]!.slice(0, 3)) : -1;
  if (i >= 0) return `${m![2]}-${String(i + 1).padStart(2, '0')}`;
  return !s || norm(s) === 'kiedys' ? null : undefined;
}

/** „dd.mm.rrrr gg:mm” czasu polskiego → ISO UTC (null, gdy tekst nie zaczyna się od daty). */
export function warsawIso(s: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s.trim());
  if (!m) return null;
  const local = Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +(m[4] ?? 12), +(m[5] ?? 0));
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(local));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const off = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - local; // przesunięcie Warszawy w tej chwili
  return new Date(local - off).toISOString();
}

const EMAIL = /[^\s;,/<>()]+@[^\s;,/<>()]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+|00)?\d[\d -]{7,}\d/g;
/** Kontakt z jednej komórki: telefony (9–11 cyfr; dwa numery bez separatora rozdzielone po 9 cyfr), e-maile i reszta tekstu. */
export function kontakt(s: string): { telefony: string[]; emaile: string[]; reszta: string } {
  const emaile = (s.match(EMAIL) ?? []).map((e) => e.toLowerCase());
  const telefony: string[] = [];
  const rest = s.replace(EMAIL, ' ').replace(PHONE, (m) => {
    const d = phoneDigits(m);
    if (d.length >= 9 && d.length <= 11) telefony.push(m.trim());
    else if (d.length % 9 === 0 && !/^\s*(\+|00)/.test(m)) for (let i = 0; i < d.length; i += 9) telefony.push(d.slice(i, i + 9).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'));
    else return m;
    return ' ';
  });
  const reszta = rest.replace(/\b(tel|telefon|kom|e-?mail|mail)\b\.?:?/gi, ' ').replace(/[;,/|:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { telefony, emaile, reszta };
}

export function transform(old: OldData, dict: { rodzaj: string; wartosc: string; grupa: string | null }[]): Plan {
  const review: Review[] = [];
  const note = (r: Pick<Review, 'co' | 'arkusz' | 'wiersz' | 'opis'> & Partial<Review>) => review.push({ dzien: null, osoba: '', tekst: '', ile: 1, pominiete: false, ...r });

  // --- słowniki: wartość z arkusza → istniejąca (bez wielkości liter i znaków), alias albo dopisana ---
  const add: DictAdd[] = [];
  const all = (rodzaj: DictRodzaj) => [...dict.filter((r) => r.rodzaj === rodzaj), ...add.filter((r) => r.rodzaj === rodzaj)];
  const val = (rodzaj: DictRodzaj, v: string, extra: Omit<DictAdd, 'rodzaj' | 'wartosc'> = {}): string => {
    v = v.trim();
    if (!v) return '';
    const find = (w: string) => all(rodzaj).find((r) => norm(r.wartosc) === norm(w))?.wartosc;
    const alias = ALIAS[rodzaj]?.[norm(v)];
    const hit = find(v) ?? (alias && find(alias));
    if (hit) return hit;
    add.push({ rodzaj, wartosc: v, ...extra });
    return v;
  };
  const groupOf = (rodzaj: DictRodzaj, v: string) => all(rodzaj).find((r) => r.wartosc === v)?.grupa ?? null;
  const status = (rodzaj: 'status_zlecenia' | 'status_leada', v: string, sekcja: string, arkusz: string, wiersz: number): string => {
    const grupa = SEKCJA_GRUPA[sekcja] ?? 'aktualne';
    if (v) return val(rodzaj, v, { grupa });
    const first = all(rodzaj).find((r) => r.grupa === grupa)?.wartosc ?? '';
    note({ co: rodzaj === 'status_zlecenia' ? 'zlecenia' : 'wyceny', arkusz, wiersz, opis: `Brak statusu – przyjęto „${first}” (sekcja ${sekcja})` });
    return first;
  };
  const kategoria = (kod: string, co: Co, arkusz: string, wiersz: number): string => {
    if (!kod) return '';
    const k = KATEGORIE[kod.trim().toUpperCase()];
    if (!k) note({ co, arkusz, wiersz, tekst: kod, opis: `Nieznany kod kategorii „${kod}” – przyjęto „Inne”` });
    return val('kategoria', k ?? 'Inne');
  };

  // --- klienci: ten sam telefon albo e-mail = jeden klient ---
  const klienci: PlanClient[] = [];
  const byKey = new Map<string, number>();
  const firma = (n: string) => /\b(sp\.?|s\.a\.|spółka|hurtownia|hotel|pensjonat|zakład|firma|ppuh|phu)\b/i.test(n);
  const client = (nazwa: string, kont: string, arkusz: string, wiersz: number, co: Co, force?: number): number | null => {
    const k = kontakt(kont);
    const keys = [...k.telefony.map((t) => `t${phoneDigits(t)}`), ...k.emaile.map((e) => `e${e}`)];
    const hits = [...new Set(keys.map((x) => byKey.get(x)).filter((x): x is number => x !== undefined))];
    let i = force ?? hits[0];
    if (hits.some((h) => h !== i)) {
      note({ co, arkusz, wiersz, tekst: kont, opis: `Kontakt wskazuje różnych klientów (${[...new Set([i!, ...hits])].map((h) => `„${klienci[h]!.nazwa}”`).join(', ')}) – przypisano do „${klienci[i!]!.nazwa}”; sprawdź, czy to jedna osoba` });
    }
    if (i === undefined) {
      if (!nazwa && !keys.length) return null;
      const same = nazwa ? klienci.find((c) => norm(c.nazwa) === norm(nazwa)) : undefined;
      i = klienci.push({ nazwa: nazwa || k.telefony[0] || k.emaile[0]!, typ: firma(nazwa) ? 'firma' : 'osoba', telefony: [], emaile: [], notatki: '', obiekty: [] }) - 1;
      if (same) note({ co: 'klienci', arkusz, wiersz, tekst: nazwa, opis: `Klient „${nazwa}” ma tę samą nazwę co inny, ale bez wspólnego telefonu ani e-maila – założono osobnych klientów; sprawdź i ewentualnie połącz` });
    } else if (nazwa) {
      const c = klienci[i]!;
      if (has(nazwa, c.nazwa)) c.nazwa = nazwa; // dłuższa nazwa („Piotr Zieliński” zamiast „Zieliński”)
      else if (!has(c.nazwa, nazwa)) note({ co, arkusz, wiersz, tekst: nazwa, opis: `„${nazwa}” ma ten sam telefon lub e-mail co klient „${c.nazwa}” – połączono` });
    }
    const c = klienci[i]!;
    for (const t of k.telefony) if (!c.telefony.some((x) => phoneDigits(x) === phoneDigits(t))) c.telefony.push(t);
    for (const e of k.emaile) if (!c.emaile.includes(e)) c.emaile.push(e);
    for (const key of keys) if (!byKey.has(key)) byKey.set(key, i);
    if (k.reszta && !c.notatki.includes(k.reszta)) c.notatki = join(c.notatki, `Kontakt: ${k.reszta}`);
    return i;
  };
  const site = (ci: number, miejscowosc: string): string | null => {
    if (!miejscowosc) return null;
    const c = klienci[ci]!;
    const hit = c.obiekty.find((o) => norm(o) === norm(miejscowosc));
    if (hit) return hit;
    c.obiekty.push(miejscowosc);
    return miejscowosc;
  };
  const closedNoDate = (co: Co, arkusz: string, wiersz: number, st: string) =>
    note({ co, arkusz, wiersz, tekst: st, opis: `Status zamknięty „${st}” bez daty zamknięcia – data zamknięcia = chwila przeniesienia` });

  // --- zlecenia (kolejność i numery ustalamy po harmonogramie) ---
  const Z = SHEET.zlecenia;
  const jobs = old.zlecenia.map((z: OldJob) => {
    const nazwa = z.klient || z.lokalizacja || '(bez nazwy)';
    if (!z.klient) note({ co: 'zlecenia', arkusz: Z, wiersz: z.wiersz, opis: `Zlecenie bez klienta – klient „${nazwa}”` });
    const ci = client(nazwa, z.kontakt, Z, z.wiersz, 'zlecenia')!;
    const t = termin(z.termin);
    if (t === undefined) note({ co: 'zlecenia', arkusz: Z, wiersz: z.wiersz, tekst: z.termin, opis: `Nieczytelny termin „${z.termin}” – zlecenie bez terminu` });
    const st = status('status_zlecenia', z.status, z.sekcja, Z, z.wiersz);
    if (groupOf('status_zlecenia', st) === 'zamkniete' && !z.zamknieto) closedNoDate('zlecenia', Z, z.wiersz, st);
    return {
      haslo: norm(z.haslo), src: z,
      job: {
        klient: ci, obiekt: site(ci, z.lokalizacja), lead: null as number | null, status: st, kategoria: kategoria(z.kat, 'zlecenia', Z, z.wiersz),
        termin: t ?? null, ekipa: z.ekipa ? val('ekipa', z.ekipa) : null, zakres: z.zakres, uwagiAdmin: z.uwagi, zamknieto: z.zamknieto,
      } satisfies PlanJob,
    };
  });

  // --- leady: lead pasujący do zlecenia (nazwisko klienta + miejscowość lub hasło w temacie) → ten sam klient ---
  const W = SHEET.wyceny;
  const leady = old.wyceny.map((w: OldLead, li) => {
    const cands = w.klient ? jobs.filter((j) => surname(j.src.klient) === surname(w.klient) && (has(w.temat, j.src.lokalizacja) || has(w.temat, j.src.haslo))) : [];
    const job = cands.length === 1 ? cands[0]! : undefined;
    if (cands.length > 1) note({ co: 'wyceny', arkusz: W, wiersz: w.wiersz, tekst: w.temat, opis: `Lead „${w.temat}” pasuje do ${cands.length} zleceń – bez powiązania; przypisz ręcznie` });
    const ci = client(w.klient, w.kontakt, W, w.wiersz, 'wyceny', job?.job.klient);
    const st = status('status_leada', w.status, w.sekcja, W, w.wiersz);
    if (groupOf('status_leada', st) === 'zamkniete' && !w.zamknieto) closedNoDate('wyceny', W, w.wiersz, st);
    if (job && norm(w.status) === 'przyjeta' && job.job.lead === null) job.job.lead = li;
    return {
      klient: ci, obiekt: job?.job.obiekt ?? null, status: st, kategoria: kategoria(w.kat, 'wyceny', W, w.wiersz),
      temat: cut(w.temat || w.klient || '(bez tematu)', 300), zrodlo: val('zrodlo', w.zrodlo), opis: w.opis,
      wartoscGr: w.wartosc === null ? null : Math.round(w.wartosc * 100), nastepny: w.nastepny ?? '', uwagi: w.uwagi,
      zamknieto: w.zamknieto, kontakty: [] as PlanContact[], src: w,
    };
  });

  // --- historia kontaktów → kontakty leadów (po temacie); bez leada (np. wpisy testowe) – pominięte ---
  const HK = SHEET.historia;
  for (const h of old.historia) {
    const same = leady.filter((l) => norm(l.src.temat) === norm(h.temat));
    const lead = same.find((l) => surname(l.src.klient) === surname(h.klient)) ?? same[0];
    const zapisano = warsawIso(h.zapisano);
    const dzien = h.dzien ?? zapisano?.slice(0, 10) ?? null;
    if (!lead || !dzien) {
      note({ co: 'historia', arkusz: HK, wiersz: h.wiersz, tekst: h.temat, pominiete: true, opis: !lead ? `Kontakt „${h.temat}” bez pasującego leada (np. wpis testowy) – pominięto` : 'Kontakt bez daty – pominięto' });
      continue;
    }
    if (h.klient && surname(lead.src.klient) !== surname(h.klient)) {
      note({ co: 'historia', arkusz: HK, wiersz: h.wiersz, tekst: h.temat, opis: `Kontakt z klientem „${h.klient}” dopięto do leada „${lead.temat}” klienta „${lead.src.klient}” (ten sam temat) – sprawdź` });
    }
    const st = h.status ? val('status_leada', h.status, { grupa: 'aktualne' }) : lead.status;
    lead.kontakty.push({ dzien, notatka: h.ustalono || 'Kontakt odbyty', nastepny: h.nastepny ?? '', status: st, plan: h.plan ?? '', zapisano });
  }
  for (const l of leady) {
    l.kontakty.sort((a, b) => a.dzien.localeCompare(b.dzien));
    const { ostatni, ustalono } = l.src;
    if (ostatni && !l.kontakty.some((k) => k.dzien === ostatni)) l.uwagi = join(l.uwagi, `Ostatni kontakt ${plDay(ostatni)}${ustalono ? `: ${ustalono}` : ''}`);
    else if (ustalono && !l.kontakty.some((k) => k.notatka === ustalono)) l.uwagi = join(l.uwagi, `Ustalono: ${ustalono}`);
  }

  // --- harmonogram: osoby z listy płac; komórka = kod, zlecenie po haśle albo tekst ---
  const H = SHEET.harmonogram;
  const persons = old.harmonogram.persons.filter((p) => p.placowa);
  const outside = old.harmonogram.persons.filter((p) => !p.placowa);
  const used = new Set<string>();
  const osoby = persons.map((p) => {
    let base = norm(p.nazwa).replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30);
    if (base.length < 2) base = 'osoba';
    let login = base;
    for (let n = 2; used.has(login); n++) login = `${base}${n}`;
    used.add(login);
    const ekipa = all('ekipa').find((r) => norm(r.wartosc) === norm(`ekipa ${p.nazwa}`))?.wartosc ?? null;
    return { nazwa: p.nazwa, login, ekipa };
  });
  for (const p of outside) {
    note({ co: 'osoby', arkusz: H, wiersz: null, osoba: p.nazwa, pominiete: true, opis: `Osoba spoza listy płac (kolumna ${p.kol}) – nie przeniesiono` });
    for (const d of old.harmonogram.days) {
      const t = d.komorki[p.kol];
      if (t) note({ co: 'harmonogram', arkusz: H, wiersz: d.wiersz, dzien: d.dzien, osoba: p.nazwa, tekst: t, pominiete: true, opis: 'Komórka osoby spoza listy płac – nie przeniesiono' });
    }
  }

  const prefixCodes = [...KODY, ...old.parametry.kody.map((k): [string, string] => [k, k])].map(([pre, k]) => [norm(pre), k] as const);
  const appCodes = new Map(dict.filter((r) => r.rodzaj === 'kod_nieobecnosci').map((r) => [norm(r.wartosc), r.wartosc]));
  /** `uwaga` = przypisano, ale do sprawdzenia; `problem` = zapisano jako tekst. */
  type Res = { slot: SlotBody; problem?: string; uwaga?: string };
  const resolve = (part: string, dzien: string): Res => {
    const s = norm(part);
    const tekst = { rodzaj: 'tekst', tekst: part } as const;
    if (part.includes('?')) return { slot: tekst, problem: 'Wpis niepewny („?”)' };
    const appKod = appCodes.get(s);
    if (appKod) return { slot: { rodzaj: 'kod', kod: appKod } };
    const kod = s === 'x' ? 'bezpłatny' : prefixCodes.find(([pre]) => s.startsWith(pre))?.[1];
    if (kod) return { slot: { rodzaj: 'kod', kod: val('kod_nieobecnosci', kod, { platne: KOD_PLATNE[kod] ?? true }) } };
    const inner = jobs.map((j, i) => ({ j, i })).filter(({ j }) => j.haslo && s.includes(j.haslo));
    const words = inner.filter(({ j }) => wordHit(s, j.haslo));
    if (!words.length) {
      return { slot: tekst, problem: inner.length ? `Hasło „${inner[0]!.j.src.haslo}” jest tylko fragmentem słowa we wpisie – nie przypisano` : 'Wpis nie pasuje do hasła żadnego zlecenia ani do kodu' };
    }
    const exact = words.filter(({ j }) => j.haslo === s);
    let c = exact.length ? exact : words;
    const len = Math.max(...c.map(({ j }) => j.haslo.length));
    c = c.filter(({ j }) => j.haslo.length === len);
    if (c.length > 1) { const m = c.filter(({ j }) => j.job.termin === dzien.slice(0, 7)); if (m.length) c = m; }
    if (c.length > 1) return { slot: tekst, problem: `Wpis pasuje do ${c.length} zleceń o tym samym haśle „${c[0]!.j.src.haslo}”` };
    const r: Res = { slot: { rodzaj: 'zlecenie', zlecenie: c[0]!.i } };
    if (words.length > 1) r.uwaga = `Wpis pasuje do ${words.length} zleceń (hasła: ${words.map(({ j }) => `„${j.src.haslo}”`).join(', ')}) – przypisano zlecenie z hasłem „${c[0]!.j.src.haslo}”`;
    return r;
  };
  const harmonogram: Plan['harmonogram'] = [];
  const uwagiDnia: Plan['uwagiDnia'] = [];
  for (const d of old.harmonogram.days) {
    persons.forEach((p, osoba) => {
      const cell = d.komorki[p.kol];
      if (!cell) return;
      const parts = cell.split('/').map((x) => x.trim()).filter(Boolean);
      const whole = resolve(cell, d.dzien);
      let res: Res[];
      if (parts.length > 2) res = [{ slot: { rodzaj: 'tekst', tekst: cell }, problem: `Więcej niż dwa wpisy w jednym dniu (${parts.length})` }];
      else if (parts.length === 2) {
        const halves = parts.map((x) => resolve(x, d.dzien));
        // „A / B” = dwa wpisy po pół dnia, gdy któraś połowa coś znaczy, chyba że ukośnik jest częścią hasła (np. „Zawoja/Markowa”)
        const slashJob = !whole.problem && whole.slot.rodzaj === 'zlecenie' && jobs[whole.slot.zlecenie]!.haslo.includes('/');
        res = !slashJob && halves.some((h) => !h.problem) ? halves : [whole];
      } else res = [whole];
      const sloty = res.map((r) => {
        if (r.slot.rodzaj === 'tekst' && r.slot.tekst.length > 200) { r.slot = { rodzaj: 'tekst', tekst: cut(r.slot.tekst, 200) }; r.problem ??= 'Wpis za długi – skrócono do 200 znaków'; }
        const opis = r.problem ? `${r.problem}${res.length === 2 ? ` (połowa „${(r.slot as { tekst: string }).tekst}”)` : ''} – zapisano jako tekst` : r.uwaga;
        if (opis) note({ co: 'harmonogram', arkusz: H, wiersz: d.wiersz, dzien: d.dzien, osoba: p.nazwa, tekst: cell, opis });
        return { ...r.slot, polDnia: res.length === 2 } as PlanSlot;
      });
      harmonogram.push({ dzien: d.dzien, osoba, sloty });
    });
    if (d.uwagi) {
      if (d.uwagi.length > 500) note({ co: 'uwagi', arkusz: H, wiersz: d.wiersz, dzien: d.dzien, tekst: d.uwagi, opis: 'Uwaga dnia za długa – skrócono do 500 znaków' });
      uwagiDnia.push({ dzien: d.dzien, tekst: cut(d.uwagi, 500) });
    }
  }

  // --- dni w harmonogramie: kolumna arkusza (komórki z hasłem u wszystkich osób) a komórki ze zleceniem po przeniesieniu ---
  const cellsOf = new Map<number, number>();
  for (const h of harmonogram) for (const i of new Set(h.sloty.flatMap((s) => (s.rodzaj === 'zlecenie' ? [s.zlecenie] : [])))) cellsOf.set(i, (cellsOf.get(i) ?? 0) + 1);
  const dni = { arkusz: 0, przeniesione: 0 };
  jobs.forEach((j, i) => {
    const poza = j.haslo ? old.harmonogram.days.reduce((n, d) => n + outside.filter((p) => has(d.komorki[p.kol] ?? '', j.haslo)).length, 0) : 0;
    const nasze = (cellsOf.get(i) ?? 0) + poza;
    if (j.src.dni === null) return;
    dni.arkusz += j.src.dni;
    dni.przeniesione += nasze;
    if (j.src.dni !== nasze) {
      note({ co: 'zlecenia', arkusz: Z, wiersz: j.src.wiersz, tekst: j.src.haslo, opis: `Dni w harmonogramie: w arkuszu ${j.src.dni}, po przeniesieniu ${nasze}${poza ? ` (w tym ${poza} u osób spoza listy płac)` : ''} – sprawdź wpisy z hasłem „${j.src.haslo}”` });
    }
  });

  // --- numery zleceń w kolejności daty: „Od” z arkusza, inaczej pierwszy dzień po przeniesieniu, inaczej miesiąc terminu, inaczej zamknięcie ---
  const od = new Map<number, string>();
  for (const h of harmonogram) for (const s of h.sloty) if (s.rodzaj === 'zlecenie' && !(od.get(s.zlecenie)! <= h.dzien)) od.set(s.zlecenie, h.dzien);
  const key = (i: number) => jobs[i]!.src.od ?? od.get(i) ?? (jobs[i]!.job.termin ? `${jobs[i]!.job.termin}-01` : null) ?? jobs[i]!.job.zamknieto ?? '9999-12-31';
  const order = jobs.map((_, i) => i).sort((a, b) => key(a).localeCompare(key(b)) || a - b);
  const pos = new Map(order.map((i, n) => [i, n]));
  for (const h of harmonogram) for (const s of h.sloty) if (s.rodzaj === 'zlecenie') s.zlecenie = pos.get(s.zlecenie)!;

  // --- zadania: grupy „form” i „fi” nie są przenoszone (decyzja właściciela) ---
  const T = SHEET.zadania;
  const zadania: PlanTask[] = [];
  for (const z of old.zadania) {
    const g = norm(z.grupa) || norm(z.sekcja);
    if (g === 'form' || g === 'fi') { note({ co: 'zadania', arkusz: T, wiersz: z.wiersz, tekst: z.tekst, pominiete: true, opis: `Zadanie z grupy „${z.grupa || z.sekcja}” – nie przeniesiono (decyzja właściciela)` }); continue; }
    const tekst = z.tekst || z.uwagi || '(bez treści)';
    if (tekst.length > 500) note({ co: 'zadania', arkusz: T, wiersz: z.wiersz, opis: 'Treść zadania za długa – skrócono do 500 znaków' });
    const pr = z.priorytet === null ? null : Math.round(z.priorytet);
    if (pr !== null && (pr < 1 || pr > 9)) note({ co: 'zadania', arkusz: T, wiersz: z.wiersz, opis: `Priorytet „${z.priorytet}” poza zakresem 1–9 – pominięto priorytet` });
    zadania.push({
      tekst: cut(tekst, 500), priorytet: pr !== null && pr >= 1 && pr <= 9 ? pr : null, grupa: val('grupa_zadan', z.grupa),
      status: val('status_zadania', z.status || (z.sekcja === 'ZROBIONE' ? 'Zrobione' : '')), termin: z.termin,
      cykliczne: g === 'cykliczne', uwagi: join(z.tekst ? z.uwagi : '', z.zrobiono && `Zrobiono ${plDay(z.zrobiono)}`),
    });
  }

  // --- zakupy: sklep, grupa, kwota, lista i „Zamówione” do uwag; „Zamówione” → Do kupienia ---
  const ZK = SHEET.zakupy;
  const zakupy: PlanBuy[] = old.zakupy.map((z) => {
    if (!z.co) note({ co: 'zakupy', arkusz: ZK, wiersz: z.wiersz, opis: 'Zakup bez nazwy – zapisano jako „(bez nazwy)”' });
    if (!ZAKUP_STATUS.has(norm(z.status))) note({ co: 'zakupy', arkusz: ZK, wiersz: z.wiersz, tekst: z.status, opis: `Nieznany status zakupu „${z.status}” – zapisano jako do kupienia (status w uwagach)` });
    const kupione = norm(z.status) === 'kupione' || (!z.status && z.sekcja === 'KUPIONE');
    if (kupione && !z.kupiono) note({ co: 'zakupy', arkusz: ZK, wiersz: z.wiersz, tekst: z.co, opis: 'Kupione bez daty zakupu – data zakupu = chwila przeniesienia' });
    return {
      co: cut(z.co || z.lista || '(bez nazwy)', 300), kupione, kupiono: kupione ? z.kupiono : null,
      uwagi: join(z.uwagi, z.sklep && `Sklep: ${z.sklep}`, z.grupa && `Grupa: ${z.grupa}`, z.kwota !== null && `Kwota: ${z.kwota.toFixed(2).replace('.', ',')} zł`,
        z.lista && `Lista: ${z.lista}`, !kupione && norm(z.status) !== 'do kupienia' && z.status),
    };
  });

  return {
    slowniki: add, klienci,
    zlecenia: order.map((i) => jobs[i]!.job),
    leady: leady.map(({ src: _s, ...l }) => l),
    osoby, harmonogram, uwagiDnia, zadania, zakupy, dni,
    zrodlo: {
      zlecenia: old.zlecenia.length, wyceny: old.wyceny.length, historia: old.historia.length,
      harmonogram: old.harmonogram.days.reduce((n, d) => n + Object.keys(d.komorki).length, 0),
      uwagi: old.harmonogram.days.filter((d) => d.uwagi).length,
      zadania: old.zadania.length, zakupy: old.zakupy.length, osoby: old.harmonogram.persons.length,
    },
    doPrzejrzenia: review,
  };
}
