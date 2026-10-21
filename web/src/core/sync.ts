import { api, cfg, emit } from './api.js';
import { store as defaultStore, type Change, type Store } from './store.js';

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

  async function catchUp() {
    if (!store.last) {
      const s = await api<{ records: { entity: string; id: string; data: Record<string, any> | null }[]; last: number }>('/api/snapshot');
      store.replace(s.records, s.last);
      return;
    }
    for (;;) {
      const p = await api<{ changes: Change[]; last: number; more?: boolean }>(`/api/changes?since=${store.last}`);
      for (const ch of p.changes) store.apply(ch);
      if (p.last > store.last) store.setLast(p.last); // ukryte zmiany też przesuwają kursor
      if (!p.more) return;
    }
  }

  /** Nadrabianie (snapshot albo changes?since), potem strumień. 401 = sesja wygasła; brak sieci = ponów później. */
  async function cycle() {
    clearTimeout(timer);
    if (!on || paused || es) return;
    try {
      await catchUp();
    } catch (err) {
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
    // Przeglądarka łączyłaby sama z Last-Event-ID; zamykamy i łączymy po swojemu z since=last.
    e.onerror = () => { if (es === e) retry(); };
  }

  return {
    /** Promise kończy się po pierwszej próbie nadrobienia (offline: dane z IndexedDB, ponowienie w tle). */
    async start() {
      on = true;
      paused = false;
      attempt = 0;
      await cycle();
    },
    stop() {
      on = false;
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
