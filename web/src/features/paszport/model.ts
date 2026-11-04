import { addDays } from '@etner/shared';
import type { Rec } from '../../core/store.js';

/** Plik teczki z numerem zlecenia, z którego pochodzi (dziennik, zakres prac). */
export type Plik = { a: Rec; jobId?: string };
export type Teczka = {
  kategoria: string;
  /** Wiersz `passport_folders` (prawdziwy albo tymczasowy z kolejki); brak = teczka tylko z danych zleceń. */
  folder?: Rec;
  jobIds: string[];
  devices: Rec[];
  entries: Rec[];
  photos: Plik[];
  docs: Plik[];
  nastepnySerwis?: string;
};
export type Dane = { jobs: Rec[]; folders: Rec[]; diary: Rec[]; scope: Rec[]; attachments: Rec[]; devices: Rec[]; service: Rec[] };

type Idx = Map<string, Rec[]>;
const push = (m: Idx, k: string, r: Rec) => { const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); };
/** Indeksy danych sklepu liczone raz (lista „Paszporty”: wiele obiektów naraz). */
export type Indeks = { jobs: Idx; folders: Idx; byJob: Idx; byOwner: Idx; devices: Idx; service: Idx; teczka: Idx };
export function indeks(d: Dane): Indeks {
  const jobOfEntry = new Map(d.diary.filter((e) => e.ownerType === 'job').map((e) => [e.id, e.ownerId as string]));
  const jobOfScope = new Map(d.scope.map((s) => [s.id, s.jobId as string]));
  const i: Indeks = { jobs: new Map(), folders: new Map(), byJob: new Map(), byOwner: new Map(), devices: new Map(), service: new Map(), teczka: new Map() };
  for (const j of d.jobs) if (j.kategoria) push(i.jobs, j.siteId, j);
  for (const f of d.folders) push(i.folders, f.siteId, f);
  // urządzenia, wpisy i pliki teczki: po teczce albo (obiekt, kategoria) – zapisy z kolejki przed utworzeniem teczki
  const byTeczka = (m: Idx, r: Rec, folderId: string) => { push(m, `f:${folderId}`, r); if (r.siteId && r.kategoria) push(m, `s:${r.siteId}|${r.kategoria}`, r); };
  for (const x of d.devices) byTeczka(i.devices, x, x.folderId);
  for (const x of d.service) byTeczka(i.service, x, x.folderId);
  for (const a of d.attachments) {
    const job = a.ownerType === 'entry' ? jobOfEntry.get(a.ownerId) : a.ownerType === 'scope' ? jobOfScope.get(a.ownerId) : undefined;
    if (job) push(i.byJob, job, a);
    else if (a.ownerType === 'teczka') byTeczka(i.teczka, a, a.ownerId);
    else if (a.ownerType === 'service' || a.ownerType === 'device') push(i.byOwner, `${a.ownerType}:${a.ownerId}`, a);
  }
  return i;
}

/**
 * Teczki obiektu jak na serwerze (GET /api/sites/:id/teczki), ze sklepu – działa offline:
 * kategorie zleceń obiektu ∪ wiersze teczek, w kolejności słownika `order`. Zdjęcia i pliki z dzienników i zakresu prac zleceń,
 * dodane w teczce, przy wpisach serwisowych i urządzeniach. Zapisy z kolejki (bez teczki na serwerze) mają `siteId` i `kategoria`.
 * `idx` – indeksy `indeks(d)` policzone raz dla wielu obiektów.
 */
export function teczkiObiektu(siteId: string, d: Dane, order: string[], idx: Indeks = indeks(d)): Teczka[] {
  const jobs = idx.jobs.get(siteId) ?? [];
  const folders = idx.folders.get(siteId) ?? [];
  const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const kats = [...new Set([...jobs.map((j) => j.kategoria as string), ...folders.map((f) => f.kategoria as string)])].sort((a, b) => pos(a) - pos(b));
  return kats.map((kategoria) => {
    const fs = folders.filter((f) => f.kategoria === kategoria);
    const folder = fs.find((f) => !f._tmp) ?? fs[0];
    // jeden rekord pod oboma kluczami (teczka i obiekt+kategoria) liczony raz
    const own = (m: Idx) => [...new Set([...fs.flatMap((f) => m.get(`f:${f.id}`) ?? []), ...(m.get(`s:${siteId}|${kategoria}`) ?? [])])];
    const jobIds = jobs.filter((j) => j.kategoria === kategoria).map((j) => j.id as string);
    const devices = own(idx.devices);
    const entries = own(idx.service).sort((a, b) => (a.dzien === b.dzien ? (a.createdAt < b.createdAt ? 1 : -1) : a.dzien < b.dzien ? 1 : -1));
    const files: Plik[] = [
      ...jobIds.flatMap((jobId) => (idx.byJob.get(jobId) ?? []).map((a) => ({ a, jobId }))),
      ...own(idx.teczka).map((a) => ({ a })),
      ...entries.flatMap((e) => idx.byOwner.get(`service:${e.id}`) ?? []).map((a) => ({ a })),
      ...devices.flatMap((x) => idx.byOwner.get(`device:${x.id}`) ?? []).map((a) => ({ a })),
    ];
    files.sort((x, y) => (x.a.createdAt < y.a.createdAt ? 1 : -1));
    return {
      kategoria, jobIds, devices, entries,
      ...(folder && { folder }),
      photos: files.filter((f) => isPhoto(f.a)),
      docs: files.filter((f) => !isPhoto(f.a)),
      ...(folder?.nastepnySerwis && { nastepnySerwis: folder.nastepnySerwis as string }),
    };
  });
}

/** Zdjęcia osobno od dokumentów, ściśle po rodzaju pliku (też zdjęcie dodane przez „+ Plik”). */
export const isPhoto = (a: Rec): boolean => a.rodzaj === 'zdjecie' || String(a.mime ?? '').startsWith('image/');

const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 864e5);
/** Znacznik terminu serwisu: zaległy, za N dni (do 30), albo data. */
export function serwisStan(nastepny: string | null | undefined, today: string): { label: string; tone: 'late' | 'soon' | 'later' } | null {
  if (!nastepny) return null;
  const n = dayNum(nastepny) - dayNum(today);
  if (n < 0) return { label: 'serwis zaległy', tone: 'late' };
  if (n === 0) return { label: 'następny serwis dziś', tone: 'soon' };
  if (n <= 30) return { label: `następny serwis za ${n} ${n === 1 ? 'dzień' : 'dni'}`, tone: 'soon' };
  return { label: `następny serwis ${nastepny.slice(8, 10)}.${nastepny.slice(5, 7)}.${nastepny.slice(0, 4)}`, tone: 'later' };
}

/** „Do serwisu” (P13, admin; lista i licznik w menu): teczki z terminem w 30 dni albo zaległym, od najwcześniejszego. Bez teczek tylko z kolejki. */
export const doSerwisu = (folders: Rec[], today: string): Rec[] => {
  const end = addDays(today, 30);
  return folders.filter((f) => !f._tmp && f.nastepnySerwis && f.nastepnySerwis <= end).sort((a, b) => a.nastepnySerwis.localeCompare(b.nastepnySerwis));
};

/** „1 zlecenie”, „2 zlecenia”, „5 zleceń”. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const t = n % 10, h = n % 100;
  return `${n} ${n === 1 ? one : t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many}`;
}

/** Typy dokumentów (P5); faktura tylko admin (P6). */
export const TYP_LABEL: Record<string, string> = { projekt: 'Projekt', oferta: 'Oferta', instrukcja: 'Instrukcja', faktura: 'Faktura', inne: 'Inne' };
export const typOptions = (admin: boolean) => Object.entries(TYP_LABEL).filter(([v]) => admin || v !== 'faktura').map(([value, label]) => ({ value, label }));

/** Teczka zapisu: znana (`folderId`) albo (obiekt, kategoria) – serwer ją założy (zapis z kolejki przed utworzeniem teczki). */
export const target = (t: Teczka | undefined, siteId: string, kategoria: string) => (t?.folder && !t.folder._tmp ? { folderId: t.folder.id as string } : { siteId, kategoria });

/** Klucz „ostatnio widziane” teczki (localStorage jak przy zleceniach; serwer przyjmuje tylko id zleceń). */
export const seenKey = (siteId: string, kategoria: string) => `psz:${siteId}:${kategoria}`;
/**
 * „Nowe” w teczce od ostatniej wizyty (spec §7): wpisy serwisowe, urządzenia i pliki dodane w teczce (też przy wpisach i urządzeniach)
 * przez inną osobę. Zdjęcia i pliki z dzienników mają znacznik w karcie zlecenia, tu się nie liczą.
 */
export function freshIn(t: Teczka | undefined, since: string | undefined, meId: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!t || !since) return out;
  const add = (r: Rec, by: unknown) => { if (!r._tmp && by !== meId && r.createdAt > since) out.add(r.id); };
  for (const e of t.entries) add(e, e.authorId);
  for (const d of t.devices) add(d, d.createdBy);
  for (const { a } of [...t.docs, ...t.photos]) if (a.ownerType === 'teczka' || a.ownerType === 'service' || a.ownerType === 'device') add(a, a.authorId);
  return out;
}

/** Najbliższy termin serwisu obiektu (zaległy jest najwcześniejszy), potem klient i obiekt alfabetycznie. */
export const sortPaszporty = <T extends { klient: string; site: Rec; termin?: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.termin ?? '9999').localeCompare(b.termin ?? '9999') || a.klient.localeCompare(b.klient, 'pl') || String(a.site.miejscowosc ?? '').localeCompare(String(b.site.miejscowosc ?? ''), 'pl'));

/** Kategorie teczek obiektu tak jak na serwerze (strona klienta liczy z nich kotwice): bez teczek tylko z zapisów w kolejce. */
export const kategorieSerwera = (teczki: Teczka[]): string[] =>
  teczki.filter((t) => t.jobIds.some((id) => !id.startsWith('tmp-')) || (t.folder && !t.folder._tmp)).map((t) => t.kategoria);
