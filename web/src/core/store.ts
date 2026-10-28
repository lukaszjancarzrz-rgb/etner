import { del, entries, set } from 'idb-keyval';
import { useMemo, useSyncExternalStore } from 'react';

export type Rec = { id: string } & Record<string, any>;
/** `by`: autor zmiany (null = system). */
export type Change = { seq: number; entity: string; id: string; action: string; data: Record<string, any> | null; by?: string | null };
/** Zmiana optymistyczna: stan przed (`prev`) i po (`next`); brak = rekordu nie ma. */
export type Undo = { entity: string; id: string; prev?: Rec; next?: Rec };

const KEY = (e: string) => `e:${e}`;

export interface Store {
  get(e: string, id: string | undefined): Rec | undefined;
  all(e: string): Rec[];
  put(e: string, r: Rec): void;
  remove(e: string, id: string): void;
  readonly last: number;
  setLast(n: number): void;
  apply(ch: Change): void;
  replace(records: { entity: string; id: string; data: Record<string, any> | null }[], last: number): void;
  record(fn: (s: Store) => void): Undo[];
  undo(us: Undo[]): void;
  subscribe(f: () => void): () => void;
  load(): Promise<void>;
  flush(): Promise<void>;
  clear(): Promise<void>;
}

export function createStore(): Store {
  const maps = new Map<string, Map<string, Rec>>();
  const lists = new Map<string, Rec[]>(); // stabilne tablice dla useSyncExternalStore
  const subs = new Set<() => void>();
  const dirty = new Set<string>();
  let last = 0;
  let lastDirty = false;
  let saving: Promise<void> = Promise.resolve();
  let scheduled = false;
  let recording: Undo[] | null = null;

  const map = (e: string) => {
    let m = maps.get(e);
    if (!m) maps.set(e, (m = new Map()));
    return m;
  };
  const touched = (e: string) => {
    if (e) { dirty.add(e); lists.delete(e); }
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      persist();
      for (const f of subs) f();
    });
  };
  const persist = () => {
    const es = [...dirty];
    dirty.clear();
    const writeLast = lastDirty;
    lastDirty = false;
    saving = saving.then(async () => {
      for (const e of es) await set(KEY(e), [...map(e).values()]);
      if (writeLast) await set('last', last);
    }).catch((err) => console.error('IndexedDB', err));
  };
  const note = (e: string, id: string) => {
    if (recording && !recording.some((u) => u.entity === e && u.id === id)) recording.push({ entity: e, id, prev: map(e).get(id) });
  };

  const s: Store = {
    get: (e, id) => (id ? maps.get(e)?.get(id) : undefined),
    all(e: string): Rec[] {
      let l = lists.get(e);
      if (!l) lists.set(e, (l = [...(maps.get(e)?.values() ?? [])]));
      return l;
    },
    put(e: string, r: Rec) { note(e, r.id); map(e).set(r.id, r); touched(e); },
    remove(e: string, id: string) { note(e, id); if (map(e).delete(id)) touched(e); },
    get last() { return last; },
    setLast(n: number) { last = n; lastDirty = true; touched(''); },
    apply(ch: Change) {
      if (ch.action === 'delete' || !ch.data || ch.data.deletedAt) s.remove(ch.entity, ch.id);
      // `_by`: kto ostatnio zmienił rekord (do „nowe”); zmiana systemu (by=null) zostawia poprzedniego; snapshot go nie ma
      else s.put(ch.entity, { ...ch.data, id: ch.id, _by: ch.by ?? s.get(ch.entity, ch.id)?._by });
      if (ch.seq > last) s.setLast(ch.seq);
    },
    /** Snapshot: wszystkie kolekcje zastąpione. */
    replace(records: { entity: string; id: string; data: Record<string, any> | null }[], newLast: number) {
      for (const e of maps.keys()) { maps.get(e)!.clear(); touched(e); }
      for (const r of records) if (r.data) { map(r.entity).set(r.id, { ...r.data, id: r.id }); touched(r.entity); }
      s.setLast(newLast);
    },
    /** Uruchamia fn i zwraca, jak cofnąć jego zmiany. */
    record(fn) {
      recording = [];
      try {
        fn(s);
        return recording.map((u) => ({ ...u, next: map(u.entity).get(u.id) }));
      } finally { recording = null; }
    },
    /** Cofa tylko rekordy, które nadal mają wartość optymistyczną (nowszej wersji z serwera nie ruszamy). */
    undo(us: Undo[]) {
      for (const u of [...us].reverse()) {
        if (JSON.stringify(map(u.entity).get(u.id)) !== JSON.stringify(u.next)) continue;
        if (u.prev) map(u.entity).set(u.id, u.prev); else map(u.entity).delete(u.id);
        touched(u.entity);
      }
    },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
    async load() {
      // jedna transakcja zamiast odczytu klucz po kluczu (start aplikacji, LCP)
      for (const [k, v] of await entries()) {
        if (typeof k === 'string' && k.startsWith('e:')) {
          const m = map(k.slice(2));
          for (const r of (v as Rec[]) ?? []) m.set(r.id, r);
          lists.delete(k.slice(2));
        }
        if (k === 'last') last = (v as number) ?? 0;
      }
      for (const f of subs) f();
    },
    /** Czeka na zapis do IndexedDB. */
    async flush() { if (scheduled) await new Promise<void>((r) => queueMicrotask(r)); await saving; },
    /** Wylogowanie / inny użytkownik: czyści pamięć i IndexedDB. */
    async clear() {
      await s.flush();
      for (const e of maps.keys()) { await del(KEY(e)); lists.delete(e); }
      maps.clear();
      last = 0;
      await del('last');
      for (const f of subs) f();
    },
  };
  return s;
}

export const store = createStore();

/** Rekordy encji (bez usuniętych); filtr liczony przy zmianie danych. */
export function useEntities(entity: string, filter?: (r: Rec) => boolean): Rec[] {
  const all = useSyncExternalStore(store.subscribe, () => store.all(entity));
  // filtr spoza useCallback liczy się przy każdym renderze (poprawnie, tylko drożej)
  return useMemo(() => (filter ? all.filter(filter) : all), [all, filter]);
}

export function useEntity(entity: string, id: string | undefined): Rec | undefined {
  return useSyncExternalStore(store.subscribe, () => store.get(entity, id));
}
