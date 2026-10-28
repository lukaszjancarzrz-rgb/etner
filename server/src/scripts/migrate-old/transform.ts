import type { DictGrupa, DictRodzaj } from '@etner/shared';
import { norm, phoneDigits } from '../../modules/klienci/service.js';
import { SHEETS as SHEET } from './layout.js';
import type { OldData, OldJob, OldLead } from './old-data.js';

/** Grupa raportu (źródło / baza / pominięte). */
export type Co = 'zlecenia' | 'wyceny' | 'historia' | 'harmonogram' | 'uwagi' | 'zadania' | 'zakupy' | 'osoby';
/** Pozycja „do przejrzenia”; `pominiete` = nie przeniesiono (liczy się do różnicy źródło – baza), inaczej przeniesiono z uwagą. */
export type Review = { co: Co | 'klienci'; arkusz: string; wiersz: number | null; opis: string; ile: number; pominiete: boolean };

export type PlanClient = { nazwa: string; typ: 'osoba' | 'firma'; telefony: string[]; emaile: string[]; notatki: string; obiekty: string[] };
export type PlanJob = { klient: number; obiekt: string | null; lead: number | null; status: string; kategoria: string; termin: string | null; ekipa: string | null; zakres: string; uwagiAdmin: string; zamknieto: string | null };
export type PlanContact = { dzien: string; notatka: string; nastepny: string };
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
/** Kody harmonogramu po początku tekstu (jak w arkuszu); „x” = bezpłatny. */
const KODY: [string, string][] = [
  ['urlop n', 'na żądanie'], ['urlop o', 'okolicznościowy'], ['urlop b', 'bezpłatny'], ['urlop', 'urlop'], ['na ż', 'na żądanie'],
  ['l4', 'L4'], ['okoli', 'okolicznościowy'], ['bezpł', 'bezpłatny'], ['wolne', 'wolne'],
];
const KOD_PLATNE: Record<string, boolean> = { 'na żądanie': true, okolicznościowy: true, bezpłatny: false };
const MIESIACE = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'];

const plDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const has = (a: string, b: string) => !!b && norm(a).includes(norm(b));
const surname = (s: string) => norm(s).split(' ').at(-1) ?? '';
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const join = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join('; ');

/** „październik 2026” → 2026-10; „kiedyś” i puste → null. */
export function termin(s: string): string | null | undefined {
  const m = /^(\p{L}+)\s+(\d{4})$/u.exec(norm(s));
  const i = m ? MIESIACE.indexOf(m[1]!.slice(0, 3)) : -1;
  if (i >= 0) return `${m![2]}-${String(i + 1).padStart(2, '0')}`;
  return !s || norm(s) === 'kiedys' ? null : undefined;
}

const EMAIL = /[^\s;,/<>()]+@[^\s;,/<>()]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+|00)?\d[\d -]{7,}\d/g;
/** Kontakt z jednej komórki: telefony (9–11 cyfr), e-maile i reszta tekstu. */
export function kontakt(s: string): { telefony: string[]; emaile: string[]; reszta: string } {
  const emaile = (s.match(EMAIL) ?? []).map((e) => e.toLowerCase());
  const telefony: string[] = [];
  const rest = s.replace(EMAIL, ' ').replace(PHONE, (m) => {
    const d = phoneDigits(m);
    if (d.length < 9 || d.length > 11) return m;
    telefony.push(m.trim());
    return ' ';
  });
  const reszta = rest.replace(/\b(tel|telefon|kom|e-?mail|mail)\b\.?:?/gi, ' ').replace(/[;,/|:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { telefony, emaile, reszta };
}

export function transform(old: OldData, dict: { rodzaj: string; wartosc: string; grupa: string | null }[]): Plan {
  const review: Review[] = [];
  const note = (r: Omit<Review, 'ile' | 'pominiete'> & Partial<Review>) => review.push({ ile: 1, pominiete: false, ...r });

  // --- słowniki: wartość z arkusza → istniejąca (bez wielkości liter i znaków), alias albo dopisana ---
  const add: DictAdd[] = [];
  const val = (rodzaj: DictRodzaj, v: string, extra: Omit<DictAdd, 'rodzaj' | 'wartosc'> = {}): string => {
    if (!v) return '';
    const all = [...dict.filter((r) => r.rodzaj === rodzaj), ...add.filter((r) => r.rodzaj === rodzaj)];
    const find = (w: string) => all.find((r) => norm(r.wartosc) === norm(w))?.wartosc;
    const alias = ALIAS[rodzaj]?.[norm(v)];
    const hit = find(v) ?? (alias && find(alias));
    if (hit) return hit;
    add.push({ rodzaj, wartosc: v, ...extra });
    return v;
  };
  const status = (rodzaj: 'status_zlecenia' | 'status_leada', v: string, sekcja: string, arkusz: string, wiersz: number): string => {
    const grupa = SEKCJA_GRUPA[sekcja] ?? 'aktualne';
    if (v) return val(rodzaj, v, { grupa });
    const first = [...dict, ...add].find((r) => r.rodzaj === rodzaj && r.grupa === grupa)?.wartosc ?? '';
    note({ co: rodzaj === 'status_zlecenia' ? 'zlecenia' : 'wyceny', arkusz, wiersz, opis: `Brak statusu – przyjęto „${first}” (sekcja ${sekcja})` });
    return first;
  };
  const kategoria = (kod: string, co: Co, arkusz: string, wiersz: number): string => {
    if (!kod) return '';
    const k = KATEGORIE[kod.trim().toUpperCase()];
    if (!k) note({ co, arkusz, wiersz, opis: `Nieznany kod kategorii „${kod}” – przyjęto „Inne”` });
    return val('kategoria', k ?? 'Inne');
  };

  // --- klienci: ten sam telefon albo e-mail = jeden klient ---
  const klienci: PlanClient[] = [];
  const byKey = new Map<string, number>();
  const firma = (n: string) => /\b(sp\.?|s\.a\.|spółka|hurtownia|hotel|pensjonat|zakład|firma|ppuh|phu)\b/i.test(n);
  const client = (nazwa: string, kont: string, arkusz: string, wiersz: number, co: Co, force?: number): number | null => {
    const k = kontakt(kont);
    const keys = [...k.telefony.map((t) => `t${phoneDigits(t)}`), ...k.emaile.map((e) => `e${e}`)];
    let i = force ?? keys.map((x) => byKey.get(x)).find((x) => x !== undefined);
    if (i === undefined) {
      if (!nazwa && !keys.length) return null;
      const same = nazwa ? klienci.find((c) => norm(c.nazwa) === norm(nazwa)) : undefined;
      i = klienci.push({ nazwa: nazwa || k.telefony[0] || k.emaile[0]!, typ: firma(nazwa) ? 'firma' : 'osoba', telefony: [], emaile: [], notatki: '', obiekty: [] }) - 1;
      if (same) note({ co: 'klienci', arkusz, wiersz, opis: `Klient „${nazwa}” ma tę samą nazwę co inny, ale bez wspólnego telefonu ani e-maila – założono osobnych klientów; sprawdź i ewentualnie połącz` });
    } else if (nazwa) {
      const c = klienci[i]!;
      if (has(nazwa, c.nazwa)) c.nazwa = nazwa; // dłuższa nazwa („Piotr Zieliński” zamiast „Zieliński”)
      else if (!has(c.nazwa, nazwa)) note({ co, arkusz, wiersz, opis: `„${nazwa}” ma ten sam telefon lub e-mail co klient „${c.nazwa}” – połączono` });
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

  // --- zlecenia (kolejność i numery ustalamy po harmonogramie) ---
  const Z = SHEET.zlecenia;
  const jobs = old.zlecenia.map((z: OldJob) => {
    const nazwa = z.klient || z.lokalizacja || '(bez nazwy)';
    if (!z.klient) note({ co: 'zlecenia', arkusz: Z, wiersz: z.wiersz, opis: `Zlecenie bez klienta – klient „${nazwa}”` });
    const ci = client(nazwa, z.kontakt, Z, z.wiersz, 'zlecenia')!;
    const t = termin(z.termin);
    if (t === undefined) note({ co: 'zlecenia', arkusz: Z, wiersz: z.wiersz, opis: `Nieczytelny termin „${z.termin}” – zlecenie bez terminu` });
    return {
      haslo: norm(z.haslo), src: z,
      job: {
        klient: ci, obiekt: site(ci, z.lokalizacja), lead: null as number | null,
        status: status('status_zlecenia', z.status, z.sekcja, Z, z.wiersz), kategoria: kategoria(z.kat, 'zlecenia', Z, z.wiersz),
        termin: t ?? null, ekipa: z.ekipa ? val('ekipa', z.ekipa) : null, zakres: z.zakres, uwagiAdmin: z.uwagi, zamknieto: z.zamknieto,
      } satisfies PlanJob,
    };
  });

  // --- leady: lead pasujący do zlecenia (nazwisko klienta + miejscowość lub hasło w temacie) → ten sam klient ---
  const W = SHEET.wyceny;
  const leady = old.wyceny.map((w: OldLead, li) => {
    const cands = w.klient ? jobs.filter((j) => surname(j.src.klient) === surname(w.klient) && (has(w.temat, j.src.lokalizacja) || has(w.temat, j.src.haslo))) : [];
    const job = cands.length === 1 ? cands[0]! : undefined;
    if (cands.length > 1) note({ co: 'wyceny', arkusz: W, wiersz: w.wiersz, opis: `Lead „${w.temat}” pasuje do ${cands.length} zleceń – bez powiązania; przypisz ręcznie` });
    const ci = client(w.klient, w.kontakt, W, w.wiersz, 'wyceny', job?.job.klient);
    const st = status('status_leada', w.status, w.sekcja, W, w.wiersz);
    if (job && norm(w.status) === 'przyjeta' && job.job.lead === null) job.job.lead = li;
    return {
      klient: ci, obiekt: job?.job.obiekt ?? null, status: st, kategoria: kategoria(w.kat, 'wyceny', W, w.wiersz),
      temat: cut(w.temat || w.klient || '(bez tematu)', 300), zrodlo: val('zrodlo', w.zrodlo), opis: w.opis,
      wartoscGr: w.wartosc === null ? null : Math.round(w.wartosc * 100), nastepny: w.nastepny ?? '', uwagi: w.uwagi,
      zamknieto: w.zamknieto, kontakty: [] as PlanContact[], src: w,
    };
  });

  // --- historia kontaktów → kontakty leadów (po temacie); bez leada (np. wpisy testowe) – pominięte ---
  for (const h of old.historia) {
    const same = leady.filter((l) => norm(l.src.temat) === norm(h.temat));
    const lead = same.find((l) => surname(l.src.klient) === surname(h.klient)) ?? same[0];
    const dzien = h.dzien ?? (/^(\d{2})\.(\d{2})\.(\d{4})/.exec(h.zapisano)?.slice(1).reverse().join('-') || null);
    if (!lead || !dzien) {
      note({ co: 'historia', arkusz: SHEET.historia, wiersz: h.wiersz, pominiete: true, opis: !lead ? `Kontakt „${h.temat}” bez pasującego leada (np. wpis testowy) – pominięto` : 'Kontakt bez daty – pominięto' });
      continue;
    }
    lead.kontakty.push({ dzien, notatka: h.ustalono || 'Kontakt odbyty', nastepny: h.nastepny ?? '' });
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
  const used = new Set<string>();
  const osoby = persons.map((p) => {
    let base = norm(p.nazwa).replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30);
    if (base.length < 2) base = 'osoba';
    let login = base;
    for (let n = 2; used.has(login); n++) login = `${base}${n}`;
    used.add(login);
    const ekipa = [...dict, ...add].find((r) => r.rodzaj === 'ekipa' && norm(r.wartosc) === norm(`ekipa ${p.nazwa}`))?.wartosc ?? null;
    return { nazwa: p.nazwa, login, ekipa };
  });
  for (const p of old.harmonogram.persons.filter((x) => !x.placowa)) {
    const ile = old.harmonogram.days.filter((d) => d.komorki[p.kol]).length;
    note({ co: 'osoby', arkusz: H, wiersz: null, pominiete: true, opis: `Osoba „${p.nazwa}” (kolumna ${p.kol}) spoza listy płac – nie przeniesiono` });
    if (ile) note({ co: 'harmonogram', arkusz: H, wiersz: null, pominiete: true, ile, opis: `Komórki osoby „${p.nazwa}” (kolumna ${p.kol}) spoza listy płac – nie przeniesiono` });
  }

  const codes: [string, string][] = [...KODY, ...[...old.parametry.kody, ...dict.filter((r) => r.rodzaj === 'kod_nieobecnosci').map((r) => r.wartosc)].map((k): [string, string] => [k, k])]
    .map(([pre, k]) => [norm(pre), k]);
  type Res = { slot: SlotBody; problem?: string };
  const resolve = (part: string, dzien: string): Res => {
    const s = norm(part);
    if (part.includes('?')) return { slot: { rodzaj: 'tekst', tekst: part }, problem: 'Wpis niepewny („?”)' };
    const kod = s === 'x' ? 'bezpłatny' : codes.find(([pre]) => s.startsWith(pre))?.[1];
    if (kod) return { slot: { rodzaj: 'kod', kod: val('kod_nieobecnosci', kod, { platne: KOD_PLATNE[kod] ?? true }) } };
    let c = jobs.map((j, i) => ({ j, i })).filter(({ j }) => j.haslo && s.includes(j.haslo));
    const len = Math.max(0, ...c.map(({ j }) => j.haslo.length));
    c = c.filter(({ j }) => j.haslo.length === len);
    if (c.length > 1) { const m = c.filter(({ j }) => j.job.termin === dzien.slice(0, 7)); if (m.length) c = m; }
    if (c.length === 1) return { slot: { rodzaj: 'zlecenie', zlecenie: c[0]!.i } };
    return { slot: { rodzaj: 'tekst', tekst: part }, problem: c.length ? `Wpis pasuje do kilku zleceń (${c.length})` : 'Wpis nie pasuje do hasła żadnego zlecenia ani do kodu' };
  };
  const cellReview = new Map<string, Review & { pierwszy: string }>();
  const harmonogram: Plan['harmonogram'] = [];
  const uwagiDnia: Plan['uwagiDnia'] = [];
  for (const d of old.harmonogram.days) {
    persons.forEach((p, osoba) => {
      const cell = d.komorki[p.kol];
      if (!cell) return;
      const parts = cell.split('/').map((x) => x.trim()).filter(Boolean);
      const halves = parts.length === 2 ? parts.map((x) => resolve(x, d.dzien)) : null;
      const whole = resolve(cell, d.dzien);
      // „A / B” = dwa wpisy po pół dnia, chyba że ukośnik jest częścią hasła zlecenia (np. „Zawoja/Markowa”)
      const slashJob = whole.slot.rodzaj === 'zlecenie' && jobs[whole.slot.zlecenie]!.haslo.includes('/');
      const res = halves && (halves.every((h) => !h.problem) || !slashJob) ? halves : [whole];
      if (parts.length > 2) res[0]!.problem = 'Więcej niż dwa wpisy w jednym dniu';
      const sloty = res.map((r) => {
        if (r.slot.rodzaj === 'tekst' && r.slot.tekst.length > 200) { r.slot = { rodzaj: 'tekst', tekst: cut(r.slot.tekst, 200) }; r.problem ??= 'Wpis za długi – skrócono'; }
        if (r.problem) {
          const t = r.slot.rodzaj === 'tekst' ? r.slot.tekst : '';
          const key = `${r.problem}|${norm(t)}`;
          const prev = cellReview.get(key);
          if (prev) prev.ile++;
          else cellReview.set(key, { co: 'harmonogram', arkusz: H, wiersz: d.wiersz, ile: 1, pominiete: false, pierwszy: `${plDay(d.dzien)}, ${p.nazwa}`, opis: `${r.problem}: „${t}” – zapisano jako tekst` });
        }
        return { ...r.slot, polDnia: res.length === 2 } as PlanSlot;
      });
      harmonogram.push({ dzien: d.dzien, osoba, sloty });
    });
    if (d.uwagi) {
      if (d.uwagi.length > 500) note({ co: 'uwagi', arkusz: H, wiersz: d.wiersz, opis: 'Uwaga dnia za długa – skrócono do 500 znaków' });
      uwagiDnia.push({ dzien: d.dzien, tekst: cut(d.uwagi, 500) });
    }
  }
  for (const r of cellReview.values()) {
    const { pierwszy, ...rest } = r;
    review.push({ ...rest, opis: `${rest.opis} (${rest.ile}×, pierwszy: ${pierwszy})` });
  }

  // --- numery zleceń w kolejności daty: pierwszy dzień w harmonogramie, inaczej miesiąc terminu, inaczej zamknięcie ---
  const od = new Map<number, string>();
  for (const h of harmonogram) for (const s of h.sloty) if (s.rodzaj === 'zlecenie' && !(od.get(s.zlecenie)! <= h.dzien)) od.set(s.zlecenie, h.dzien);
  const key = (i: number) => od.get(i) ?? (jobs[i]!.job.termin ? `${jobs[i]!.job.termin}-01` : null) ?? jobs[i]!.job.zamknieto ?? '9999-12-31';
  const order = jobs.map((_, i) => i).sort((a, b) => key(a).localeCompare(key(b)) || a - b);
  const pos = new Map(order.map((i, n) => [i, n]));
  for (const h of harmonogram) for (const s of h.sloty) if (s.rodzaj === 'zlecenie') s.zlecenie = pos.get(s.zlecenie)!;

  // --- zadania: grupy „form” i „fi” nie są przenoszone (decyzja właściciela) ---
  const T = SHEET.zadania;
  const skipped = new Map<string, number>();
  const zadania: PlanTask[] = [];
  for (const z of old.zadania) {
    const g = norm(z.grupa) || norm(z.sekcja);
    if (g === 'form' || g === 'fi') { skipped.set(z.grupa || z.sekcja, (skipped.get(z.grupa || z.sekcja) ?? 0) + 1); continue; }
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
  for (const [g, ile] of skipped) note({ co: 'zadania', arkusz: T, wiersz: null, ile, pominiete: true, opis: `Zadania z grupy „${g}” – nie przeniesiono (decyzja właściciela)` });

  // --- zakupy: sklep, grupa, kwota, lista i „Zamówione” do uwag; „Zamówione” → Do kupienia ---
  const zakupy: PlanBuy[] = old.zakupy.map((z) => {
    if (!z.co) note({ co: 'zakupy', arkusz: SHEET.zakupy, wiersz: z.wiersz, opis: 'Zakup bez nazwy – zapisano jako „(bez nazwy)”' });
    const kupione = norm(z.status) === 'kupione' || (!z.status && z.sekcja === 'KUPIONE');
    return {
      co: cut(z.co || z.lista || '(bez nazwy)', 300), kupione, kupiono: kupione ? z.kupiono : null,
      uwagi: join(z.uwagi, z.sklep && `Sklep: ${z.sklep}`, z.grupa && `Grupa: ${z.grupa}`, z.kwota !== null && `Kwota: ${z.kwota.toFixed(2).replace('.', ',')} zł`,
        z.lista && `Lista: ${z.lista}`, norm(z.status) === 'zamowione' && 'Zamówione'),
    };
  });

  return {
    slowniki: add, klienci,
    zlecenia: order.map((i) => jobs[i]!.job),
    leady: leady.map(({ src: _s, ...l }) => l),
    osoby, harmonogram, uwagiDnia, zadania, zakupy,
    zrodlo: {
      zlecenia: old.zlecenia.length, wyceny: old.wyceny.length, historia: old.historia.length,
      harmonogram: old.harmonogram.days.reduce((n, d) => n + Object.keys(d.komorki).length, 0),
      uwagi: old.harmonogram.days.filter((d) => d.uwagi).length,
      zadania: old.zadania.length, zakupy: old.zakupy.length, osoby: old.harmonogram.persons.length,
    },
    doPrzejrzenia: review,
  };
}
