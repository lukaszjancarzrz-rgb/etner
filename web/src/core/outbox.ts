import { newOrderedId } from '@etner/shared';
import { del, delMany, getMany, keys, set } from 'idb-keyval';
import { ApiError, api, emit } from './api.js';
import { store as defaultStore, type Store, type Undo } from './store.js';

export type Write = {
  kind: string;
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  /** Pliki: najpierw POST /api/uploads, potem zapis z `uploads: [...]`. */
  files?: Blob[];
  /** Zmiana sklepu od razu; cofana automatycznie przy odrzuceniu (4xx). */
  optimistic?: (s: Store) => void;
  rollback?: (s: Store) => void;
};

/** Element w IndexedDB pod `ob:<opId>` (opId rosnący = kolejność). `uploads[i]` = id już wysłanego pliku `files[i]`. */
type Item = { opId: string; kind: string; url: string; method: string; body: Record<string, unknown>; files: Blob[]; uploads: (string | null)[]; undo: Undo[] };

// Każdy zapis ma własny klucz: dwie karty nie nadpisują sobie kolejki (brak read-modify-write całej listy).
const PREFIX = 'ob:';
const key = (opId: string) => PREFIX + opId;
const defaultBackoff = (n: number) => Math.min(30_000, 1000 * 2 ** n);
const retryable = (e: unknown) => !(e instanceof ApiError) || e.status >= 500 || e.status === 408 || e.status === 429;

async function readAll(): Promise<Item[]> {
  const ks = ((await keys()) as IDBValidKey[]).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX)).sort();
  return ((await getMany(ks)) as (Item | undefined)[]).filter((i): i is Item => !!i);
}

export function createOutbox({ store = defaultStore, backoff = defaultBackoff } = {} as { store?: Store; backoff?: (attempt: number) => number }) {
  let count = 0;
  const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; rollback?: (s: Store) => void }>();
  let saves = new Set<Promise<unknown>>(); // enqueue: element jest w IndexedDB, zanim pójdzie do serwera
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = true;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setCount = (n: number) => { if (n !== count) { count = n; emit('outbox', n); } };
  const refresh = async () => { setCount((await readAll()).length); };

  async function send(it: Item): Promise<unknown> {
    for (let i = 0; i < it.files.length; i++) {
      if (it.uploads[i]) continue;
      const fd = new FormData();
      fd.append('file', it.files[i]!, it.files[i] instanceof File ? (it.files[i] as File).name : `plik-${i + 1}.jpg`);
      const r = await api<{ uploadId: string }>('/api/uploads', { method: 'POST', body: fd });
      it.uploads[i] = r.uploadId;
      await set(key(it.opId), it); // po restarcie plik nie pójdzie drugi raz
    }
    const body: Record<string, unknown> = { ...it.body, opId: it.opId };
    if (it.files.length) body.uploads = [...((it.body.uploads as string[]) ?? []), ...it.uploads];
    return api(it.url, { method: it.method, json: body });
  }

  /** Wysyła po kolei; stan czytany z IndexedDB przed każdym elementem (inne karty mogły coś dodać lub wysłać). */
  async function drain() {
    for (;;) {
      await Promise.all(saves);
      if (stopped || o.paused) return;
      const all = await readAll();
      setCount(all.length);
      const it = all[0];
      if (!it) return;
      try {
        const res = await send(it);
        attempt = 0;
        await del(key(it.opId));
        setCount(count - 1);
        waiting.get(it.opId)?.resolve(res);
        waiting.delete(it.opId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          o.paused = true;
          emit('session-expired');
          return;
        }
        if (!retryable(e)) {
          await del(key(it.opId));
          setCount(count - 1);
          const w = waiting.get(it.opId);
          waiting.delete(it.opId);
          store.undo(it.undo);
          w?.rollback?.(store);
          if (w) w.reject(e);
          else emit('outbox-failed', { kind: it.kind, message: (e as Error).message });
          continue;
        }
        // sieć / 5xx / 408 / 429: element zostaje, ponawiamy później
        if (!stopped) timer = setTimeout(() => o.kick(), backoff(attempt++));
        return;
      }
    }
  }

  function run(): Promise<void> {
    if (running) { again = true; return running; }
    return (running = loop().finally(() => { running = null; }));
  }

  async function loop() {
    try {
      do {
        again = false;
        // Jedna karta wysyła naraz (Web Locks); bez nich podwójne wysłanie i tak scala serwer po opId.
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
        await (locks ? locks.request('etner-outbox', drain) : drain());
      } while (again && !stopped && !o.paused);
    } catch (e) {
      console.error('outbox', e);
      if (!stopped) timer = setTimeout(() => o.kick(), backoff(attempt++));
    }
  }

  const o = {
    paused: false,
    enqueue(w: Write): Promise<unknown> {
      const opId = newOrderedId();
      const undo = w.optimistic ? store.record(w.optimistic) : [];
      const it: Item = { opId, kind: w.kind, url: w.url, method: w.method, body: w.body ?? {}, files: w.files ?? [], uploads: (w.files ?? []).map(() => null), undo };
      const p = new Promise((resolve, reject) => waiting.set(opId, { resolve, reject, rollback: w.rollback }));
      const saved = set(key(opId), it);
      saves.add(saved);
      setCount(count + 1);
      void saved.finally(() => { saves.delete(saved); o.kick(); });
      return p;
    },
    pending: () => count,
    /** Wczytuje stan kolejki z IndexedDB i zaczyna wysyłać; promise = licznik wczytany. */
    start(): Promise<void> {
      stopped = false;
      o.kick();
      return refresh();
    },
    /** Tylko licznik (np. sesja wygasła już przy starcie: nic nie wysyłamy). */
    refresh,
    /** Zatrzymuje; promise = żądanie w toku zakończone. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
    /** Spróbuj teraz (online, powrót z tła). */
    kick() {
      if (stopped || o.paused) return;
      clearTimeout(timer);
      void run();
    },
    /** Po ponownym zalogowaniu. */
    resume() {
      o.paused = false;
      attempt = 0;
      o.kick();
    },
    /** Wylogowanie / inny użytkownik: kolejka kasowana świadomie. */
    async clear() {
      await Promise.all(saves);
      const ks = ((await keys()) as IDBValidKey[]).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
      await delMany(ks);
      saves = new Set();
      setCount(0);
    },
  };
  return o;
}
export type Outbox = ReturnType<typeof createOutbox>;

export const outbox = createOutbox();
