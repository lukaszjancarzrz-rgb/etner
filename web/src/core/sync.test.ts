import { get } from 'idb-keyval';
import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { bus } from './api.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { B, server, until } from './test-setup.js';

class FakeES {
  static all: FakeES[] = [];
  readyState = 1;
  onerror: (() => void) | null = null;
  private ls = new Map<string, (e: MessageEvent) => void>();
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(t: string, f: (e: MessageEvent) => void) { this.ls.set(t, f); }
  close() { this.readyState = 2; }
  emit(t: string, data: unknown, id = '') { this.ls.get(t)?.({ data: JSON.stringify(data), lastEventId: id } as MessageEvent); }
}

it('pierwszy raz snapshot, SSE zerwane: ponowne łączenie z since=last', async () => {
  server.use(
    http.get(`${B}/api/snapshot`, () => HttpResponse.json({ records: [{ entity: 'jobs', id: 'j1', data: { id: 'j1', nazwa: 'A' } }], last: 5 })),
    http.get(`${B}/api/changes`, () => HttpResponse.json({ changes: [], last: 8, more: false })),
  );
  const store = createStore();
  const sync = createSync({ store, EventSource: FakeES as unknown as typeof EventSource, backoff: () => 5 });
  expect(sync.tried).toBe(false);
  const p = sync.start();
  expect(sync.tried).toBe(false); // karta zlecenia czeka z „widziane” do końca snapshotu
  await p;
  expect(sync.tried).toBe(true);
  expect(store.get('jobs', 'j1')?.nazwa).toBe('A');
  expect(FakeES.all[0]!.url).toBe(`${B}/api/stream?since=5`);

  FakeES.all[0]!.emit('change', { seq: 7, entity: 'jobs', id: 'j2', action: 'create', data: { id: 'j2' } }, '7');
  FakeES.all[0]!.emit('change', { seq: 8, entity: 'jobs', id: 'j1', action: 'delete', data: null }, '8');
  expect(store.get('jobs', 'j2')).toBeTruthy();
  expect(store.get('jobs', 'j1')).toBeUndefined();

  FakeES.all[0]!.readyState = 2;
  FakeES.all[0]!.onerror?.();
  await until(() => FakeES.all.length === 2);
  expect(FakeES.all[1]!.url).toBe(`${B}/api/stream?since=8`);
  await store.flush();
  expect(await get('last')).toBe(8);
  sync.stop();
  expect(sync.tried).toBe(false); // wylogowanie: następny użytkownik czeka na swoją synchronizację
});

it('kolejny start: changes?since=last w pętli, potem SSE; session-expired wstrzymuje', async () => {
  const calls: string[] = [];
  server.use(http.get(`${B}/api/changes`, ({ request }) => {
    const since = new URL(request.url).searchParams.get('since')!;
    calls.push(since);
    return since === '5'
      ? HttpResponse.json({ changes: [{ seq: 6, entity: 'jobs', id: 'j3', action: 'create', data: { id: 'j3' } }], last: 6, more: true })
      : HttpResponse.json({ changes: [{ seq: 9, entity: 'jobs', id: 'j3', action: 'update', data: { id: 'j3', deletedAt: '2026-10-21T10:00:00Z' } }], last: 9, more: false });
  }));
  const s1 = createStore();
  s1.put('jobs', { id: 'j0' });
  s1.setLast(5);
  await s1.flush();
  const store = createStore();
  await store.load();
  FakeES.all = [];
  const sync = createSync({ store, EventSource: FakeES as unknown as typeof EventSource, backoff: () => 5 });
  await sync.start();
  expect(calls).toEqual(['5', '6']);
  expect(store.get('jobs', 'j0')).toBeTruthy();
  expect(store.get('jobs', 'j3')).toBeUndefined();
  expect(FakeES.all[0]!.url).toBe(`${B}/api/stream?since=9`);

  let expired = 0;
  const f = () => expired++;
  bus.addEventListener('session-expired', f);
  FakeES.all[0]!.emit('session-expired', '');
  expect(expired).toBe(1);
  expect(FakeES.all[0]!.readyState).toBe(2);
  await new Promise((r) => setTimeout(r, 30));
  expect(FakeES.all).toHaveLength(1); // bez ponownego łączenia do zalogowania
  bus.removeEventListener('session-expired', f);
  sync.stop();
});

it('401 przy ponownym łączeniu (catch-up przed strumieniem) = sesja wygasła, bez dalszych prób', async () => {
  let deny = false;
  server.use(
    http.get(`${B}/api/snapshot`, () => HttpResponse.json({ records: [], last: 3 })),
    http.get(`${B}/api/changes`, () => (deny ? HttpResponse.json({ error: 'SESJA' }, { status: 401 }) : HttpResponse.json({ changes: [], last: 3 }))),
  );
  FakeES.all = [];
  const sync = createSync({ store: createStore(), EventSource: FakeES as unknown as typeof EventSource, backoff: () => 5 });
  await sync.start();
  let expired = 0;
  const f = () => expired++;
  bus.addEventListener('session-expired', f);
  deny = true;
  FakeES.all[0]!.readyState = 2;
  FakeES.all[0]!.onerror?.();
  await until(() => expired === 1);
  await new Promise((r) => setTimeout(r, 30));
  expect(FakeES.all).toHaveLength(1);
  expect(expired).toBe(1);
  bus.removeEventListener('session-expired', f);
  sync.stop();
});

it('resync ze strumienia: strumień zamknięty, zdarzenie dla sesji, bez samodzielnego łączenia', async () => {
  server.use(http.get(`${B}/api/snapshot`, () => HttpResponse.json({ records: [], last: 3 })));
  FakeES.all = [];
  const sync = createSync({ store: createStore(), EventSource: FakeES as unknown as typeof EventSource, backoff: () => 5 });
  await sync.start();
  let n = 0;
  const f = () => n++;
  bus.addEventListener('resync', f);
  FakeES.all[0]!.emit('resync', '');
  expect(n).toBe(1);
  expect(FakeES.all[0]!.readyState).toBe(2);
  await new Promise((r) => setTimeout(r, 30));
  expect(FakeES.all).toHaveLength(1);
  bus.removeEventListener('resync', f);
  sync.stop();
});

it('nieudany pierwszy snapshot: ponawiany snapshot, nie strumień od zera', async () => {
  let n = 0;
  server.use(http.get(`${B}/api/snapshot`, () => (++n < 3 ? HttpResponse.error() : HttpResponse.json({ records: [], last: 4 }))));
  FakeES.all = [];
  const sync = createSync({ store: createStore(), EventSource: FakeES as unknown as typeof EventSource, backoff: () => 5 });
  await sync.start();
  expect(FakeES.all).toHaveLength(0);
  await until(() => FakeES.all.length === 1);
  expect(n).toBe(3);
  expect(FakeES.all[0]!.url).toBe(`${B}/api/stream?since=4`);
  sync.stop();
});

it('store.apply: _by = autor zmiany; zmiana systemu (by=null) zostawia poprzedniego (24-A 8)', () => {
  const s = createStore();
  s.apply({ seq: 1, entity: 'jobs', id: 'j', action: 'update', data: { updatedAt: 'a' }, by: 'w' });
  s.apply({ seq: 2, entity: 'jobs', id: 'j', action: 'update', data: { updatedAt: 'a', pumbleChannelId: 'c' }, by: null });
  expect(s.get('jobs', 'j')?._by).toBe('w');
  s.apply({ seq: 3, entity: 'jobs', id: 'j', action: 'update', data: { updatedAt: 'b' }, by: 'me' });
  expect(s.get('jobs', 'j')?._by).toBe('me');
});

it('store.apply: _hist najwyżej 5 poprzednich wersji jobs/clients/sites, bez zagnieżdżeń; snapshot i inne encje bez historii (R62)', () => {
  const s = createStore();
  s.replace([{ entity: 'jobs', id: 'j', data: { updatedAt: '0' } }], 0);
  for (let i = 1; i <= 7; i++) s.apply({ seq: i, entity: 'jobs', id: 'j', action: 'update', data: { updatedAt: String(i) }, by: 'w' });
  const h = s.get('jobs', 'j')!._hist;
  expect(h.map((v: any) => v.updatedAt)).toEqual(['2', '3', '4', '5', '6']);
  expect(h.every((v: any) => !('_hist' in v))).toBe(true);
  expect(h[4]._by).toBe('w');
  s.apply({ seq: 8, entity: 'diary_entries', id: 'd', action: 'update', data: { updatedAt: '1' }, by: 'w' });
  s.apply({ seq: 9, entity: 'diary_entries', id: 'd', action: 'update', data: { updatedAt: '2' }, by: 'w' });
  expect(s.get('diary_entries', 'd')!._hist).toBeUndefined();
  s.replace([{ entity: 'jobs', id: 'j', data: { updatedAt: '9' } }], 9);
  expect(s.get('jobs', 'j')!._hist).toBeUndefined();
});

it('store.apply: zmiana systemu nie dokłada wersji do _hist; szukaj i zakres nie idą do historii (R62)', () => {
  const s = createStore();
  s.apply({ seq: 1, entity: 'jobs', id: 'j', action: 'create', data: { updatedAt: '1', zakres: 'x'.repeat(1000) }, by: 'a' });
  s.apply({ seq: 2, entity: 'jobs', id: 'j', action: 'update', data: { updatedAt: '2', pumbleChannelId: 'c', zakres: 'x' }, by: null });
  expect(s.get('jobs', 'j')!._hist).toBeUndefined();
  s.apply({ seq: 3, entity: 'clients', id: 'k', action: 'create', data: { updatedAt: '1', szukaj: 'kowalski' }, by: 'a' });
  s.apply({ seq: 4, entity: 'clients', id: 'k', action: 'update', data: { updatedAt: '2', szukaj: 'nowak' }, by: 'a' });
  expect(s.get('clients', 'k')!._hist).toEqual([{ id: 'k', updatedAt: '1', _by: 'a' }]);
});
