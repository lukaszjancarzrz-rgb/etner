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

/**
 * Teczki obiektu jak na serwerze (GET /api/sites/:id/teczki), ze sklepu – działa offline:
 * kategorie zleceń obiektu ∪ wiersze teczek, w kolejności słownika `order`. Zdjęcia i pliki z dzienników i zakresu prac zleceń,
 * dodane w teczce, przy wpisach serwisowych i urządzeniach. Zapisy z kolejki (bez teczki na serwerze) mają `siteId` i `kategoria`.
 */
export function teczkiObiektu(siteId: string, d: Dane, order: string[]): Teczka[] {
  const jobs = d.jobs.filter((j) => j.siteId === siteId && j.kategoria);
  const folders = d.folders.filter((f) => f.siteId === siteId);
  const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const kats = [...new Set([...jobs.map((j) => j.kategoria as string), ...folders.map((f) => f.kategoria as string)])].sort((a, b) => pos(a) - pos(b));
  const jobOfEntry = new Map(d.diary.filter((e) => e.ownerType === 'job').map((e) => [e.id, e.ownerId as string]));
  const jobOfScope = new Map(d.scope.map((s) => [s.id, s.jobId as string]));
  return kats.map((kategoria) => {
    const fs = folders.filter((f) => f.kategoria === kategoria);
    const folder = fs.find((f) => !f._tmp) ?? fs[0];
    const ids = new Set(fs.map((f) => f.id));
    const mine = (r: Rec) => ids.has(r.folderId) || (r.siteId === siteId && r.kategoria === kategoria);
    const jobIds = jobs.filter((j) => j.kategoria === kategoria).map((j) => j.id);
    const js = new Set(jobIds);
    const devices = d.devices.filter(mine);
    const entries = d.service.filter(mine).sort((a, b) => (a.dzien === b.dzien ? (a.createdAt < b.createdAt ? 1 : -1) : a.dzien < b.dzien ? 1 : -1));
    const dev = new Set(devices.map((x) => x.id)), ent = new Set(entries.map((x) => x.id));
    const files: Plik[] = [];
    for (const a of d.attachments) {
      const job = a.ownerType === 'entry' ? jobOfEntry.get(a.ownerId) : a.ownerType === 'scope' ? jobOfScope.get(a.ownerId) : undefined;
      if (job ? js.has(job) : (a.ownerType === 'teczka' && mine({ ...a, folderId: a.ownerId })) || (a.ownerType === 'service' && ent.has(a.ownerId)) || (a.ownerType === 'device' && dev.has(a.ownerId))) files.push({ a, ...(job && { jobId: job }) });
    }
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
  if (n === 0) return { label: 'serwis dziś', tone: 'soon' };
  if (n <= 30) return { label: `serwis za ${n} ${n === 1 ? 'dzień' : 'dni'}`, tone: 'soon' };
  return { label: `serwis ${nastepny.slice(8, 10)}.${nastepny.slice(5, 7)}.${nastepny.slice(0, 4)}`, tone: 'later' };
}

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
