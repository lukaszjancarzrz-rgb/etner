import { newId } from '@etner/shared';
import { get, set } from 'idb-keyval';
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

/** Element zapisany w IndexedDB (bez funkcji). `uploads[i]` = id już wysłanego pliku `files[i]`. */
type Item = { opId: string; kind: string; url: string; method: string; body: Record<string, unknown>; files: Blob[]; uploads: (string | null)[]; undo: Undo[] };

const KEY = 'outbox';
const defaultBackoff = (n: number) => Math.min(30_000, 1000 * 2 ** n);

export function createOutbox({ store = defaultStore, backoff = defaultBackoff } = {} as { store?: Store; backoff?: (attempt: number) => number }) {
  let items: Item[] = [];
  const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; rollback?: (s: Store) => void }>();
  let saving: Promise<void> = Promise.resolve();
  let loaded: Promise<void> | null = null;
  let ready: Promise<unknown> = Promise.resolve(); // ostatni enqueue zapisany w IndexedDB
  let running = false;
  let stopped = true;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    const snap = items.map((i) => ({ ...i }));
    saving = saving.then(() => set(KEY, snap)).catch((e) => console.error('IndexedDB', e));
    emit('outbox', items.length);
    return saving;
  };
  const load = () => (loaded ??= get(KEY).then((v) => { items = [...((v as Item[]) ?? []), ...items]; emit('outbox', items.length); }));

  const drop = async (it: Item) => {
    items = items.filter((i) => i !== it);
    await save();
  };

  async function send(it: Item): Promise<unknown> {
    for (let i = 0; i < it.files.length; i++) {
      if (it.uploads[i]) continue;
      const fd = new FormData();
      fd.append('file', it.files[i]!, it.files[i] instanceof File ? (it.files[i] as File).name : `plik-${i + 1}.jpg`);
      const r = await api<{ uploadId: string }>('/api/uploads', { method: 'POST', body: fd });
      it.uploads[i] = r.uploadId;
      await save(); // po restarcie plik nie pójdzie drugi raz
    }
    const body: Record<string, unknown> = { ...it.body, opId: it.opId };
    if (it.files.length) body.uploads = [...((it.body.uploads as string[]) ?? []), ...it.uploads];
    return api(it.url, { method: it.method, json: body });
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      await load();
      while (!stopped && !o.paused && items.length) {
        await ready; // element jest w IndexedDB, zanim pójdzie do serwera
        await saving;
        const it = items[0]!;
        try {
          const res = await send(it);
          attempt = 0;
          await drop(it);
          waiting.get(it.opId)?.resolve(res);
          waiting.delete(it.opId);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            o.paused = true;
            emit('session-expired');
            return;
          }
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            await drop(it);
            const w = waiting.get(it.opId);
            waiting.delete(it.opId);
            store.undo(it.undo);
            w?.rollback?.(store);
            if (w) w.reject(e);
            else emit('outbox-failed', { kind: it.kind, message: e.message });
            continue;
          }
          // sieć / 5xx: element zostaje, ponawiamy później
          if (!stopped) timer = setTimeout(() => void run(), backoff(attempt++));
          return;
        }
      }
    } finally {
      running = false;
    }
  }

  const o = {
    paused: false,
    enqueue(w: Write): Promise<unknown> {
      const opId = newId();
      const undo = w.optimistic ? store.record(w.optimistic) : [];
      items.push({ opId, kind: w.kind, url: w.url, method: w.method, body: w.body ?? {}, files: w.files ?? [], uploads: (w.files ?? []).map(() => null), undo });
      const p = new Promise((resolve, reject) => waiting.set(opId, { resolve, reject, rollback: w.rollback }));
      ready = load().then(save);
      void ready.then(() => o.kick());
      return p;
    },
    pending: () => items.length,
    /** Wczytuje kolejkę z IndexedDB i zaczyna wysyłać; promise = kolejka wczytana. */
    start(): Promise<void> {
      stopped = false;
      o.kick();
      return load();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
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
    /** Wylogowanie: kolejka kasowana świadomie. */
    async clear() {
      items = [];
      await save();
    },
  };
  return o;
}
export type Outbox = ReturnType<typeof createOutbox>;

export const outbox = createOutbox();
