import { get, set } from 'idb-keyval';
import { api, cfg, emit } from './api.js';
import { store as defaultStore, type Change, type Store } from './store.js';

/** Czy serwer ma tę samą bazę, z której są dane urządzenia; pierwszy znany identyfikator jest zapamiętywany. */
async function sameDb(id: string | undefined): Promise<boolean> {
  if (!id) return true;
  const had = await get('db');
  if (had === undefined) await set('db', id);
  return had === undefined || had === id;
}

const defaultBackoff = (n: number) => Math.min(30_000, 1000 * 2 ** n);

/** Synchronizacja: snapshot (pierwszy raz) albo changes?since, potem SSE z ponownym łączeniem. */
export function createSync({ store = defaultStore, EventSource: ES = globalThis.EventSource, backoff = defaultBackoff } = {} as {
  store?: Store; EventSource?: typeof EventSource; backoff?: (attempt: number) => number;
}) {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let on = false;
  let paused = false;
  let gen = 0; // start/stop: odpowiedź starego nadrabiania (np. po resync i wyczyszczeniu sklepu) jest pomijana
  let tried = false; // pierwsze nadrabianie tej sesji za nami (udane albo bez sieci)
  const setTried = (v: boolean) => { if (tried !== v) { tried = v; emit('synced'); } };

  async function catchUp() {
    const g = gen;
    for (;;) {
      if (!store.last) {
        const s = await api<{ records: { entity: string; id: string; data: Record<string, any> | null }[]; last: number; db?: string }>('/api/snapshot', { timeout: 60_000 });
        if (g !== gen) return;
        store.replace(s.records, s.last);
        if (s.db) await set('db', s.db);
        return;
      }
      const p = await api<{ changes: Change[]; last: number; more?: boolean; reset?: boolean; db?: string }>(`/api/changes?since=${store.last}`);
      if (g !== gen) return;
      // Baza na serwerze odtworzona (inny db albo urządzenie „przed” bazą): dane od nowa ze snapshotu, kolejka zostaje.
      if (p.reset || !(await sameDb(p.db))) { store.setLast(0); continue; }
      for (const ch of p.changes) store.apply(ch);
      if (p.last > store.last) store.setLast(p.last); // ukryte zmiany też przesuwają kursor
      if (!p.more) return;
    }
  }

  /** Nadrabianie (snapshot albo changes?since), potem strumień. 401 = sesja wygasła; brak sieci = ponów później. */
  async function cycle() {
    clearTimeout(timer);
    if (!on || paused) return;
    if (es) { setTried(true); return; } // strumień nadal otwarty (np. ponowne logowanie po 401): dane są aktualne
    try {
      await catchUp();
      setTried(true);
    } catch (err) {
      setTried(true); // bez sieci: dane z IndexedDB
      if ((err as { status?: number }).status === 401) return expired();
      if (on && !paused) timer = setTimeout(() => void cycle(), backoff(attempt++));
      return;
    }
    connect();
  }

  // EventSource nie podaje kodu odpowiedzi (401 = zwykły błąd), więc przed ponownym łączeniem idzie catch-up.
  function retry() {
    es?.close();
    es = null;
    if (on && !paused) timer = setTimeout(() => void cycle(), backoff(attempt++));
  }

  function expired() {
    paused = true;
    es?.close();
    es = null;
    emit('session-expired');
  }

  function connect() {
    if (!on || paused || es) return;
    const e = new ES(`${cfg.base}/api/stream?since=${store.last}`, { withCredentials: true });
    es = e;
    e.addEventListener('change', (m) => {
      attempt = 0;
      store.apply(JSON.parse((m as MessageEvent).data) as Change);
    });
    e.addEventListener('ping', () => { attempt = 0; });
    e.addEventListener('session-expired', expired);
    // Zmiana roli, uprawnień lub ekipy: sesja (session.ts) sprawdza konto i łączy od nowa.
    e.addEventListener('resync', () => { e.close(); if (es === e) es = null; emit('resync'); });
    // Przeglądarka łączyłaby sama z Last-Event-ID; zamykamy i łączymy po swojemu z since=last.
    e.onerror = () => { if (es === e) retry(); };
  }

  return {
    /** Promise kończy się po pierwszej próbie nadrobienia (offline: dane z IndexedDB, ponowienie w tle). */
    /** Pierwsze nadrabianie tej sesji za nami: dopiero wtedy „widziane” w sklepie są aktualne (np. świeże logowanie). */
    get tried() { return tried; },
    async start() {
      gen++;
      setTried(false);
      on = true;
      paused = false;
      attempt = 0;
      await cycle();
    },
    stop() {
      gen++;
      on = false;
      setTried(false);
      clearTimeout(timer);
      es?.close();
      es = null;
    },
    /** Powrót z tła / sieć wróciła: od razu catch-up i strumień. */
    wake() {
      if (!on || paused) return;
      if (es && es.readyState !== 2) return;
      es?.close();
      es = null;
      attempt = 0;
      void cycle();
    },
  };
}
export type Sync = ReturnType<typeof createSync>;

export const sync = createSync();
