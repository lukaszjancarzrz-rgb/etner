import { keys } from 'idb-keyval';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiError, bus } from './api.js';
import { createOutbox } from './outbox.js';
import { createStore } from './store.js';
import { B, server, until } from './test-setup.js';

const fast = { backoff: () => 5 };
const stored = async () => (await keys()).filter((k) => String(k).startsWith('ob:')).length;

describe('outbox', () => {
  it('dwa zapisy offline, restart, sieć wraca: serwer dostaje oba po kolei, każdy raz', async () => {
    let online = false;
    const got: string[] = [];
    server.use(http.post(`${B}/api/x`, async ({ request }) => {
      if (!online) return HttpResponse.error();
      const b = (await request.json()) as { opId: string; n: number };
      got.push(`${b.n}:${b.opId}`);
      return HttpResponse.json({ ok: b.n });
    }));
    const o1 = createOutbox({ store: createStore(), ...fast });
    o1.start();
    o1.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: { n: 1 } }).catch(() => {});
    o1.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: { n: 2 } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 40)); // kilka nieudanych prób
    await o1.stop(); // „zamknięcie aplikacji”
    expect(await stored()).toBe(2);

    online = true;
    const o2 = createOutbox({ store: createStore(), ...fast });
    await o2.start();
    await until(() => o2.pending() === 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(got.map((g) => g.split(':')[0])).toEqual(['1', '2']);
    expect(new Set(got.map((g) => g.split(':')[1])).size).toBe(2);
    expect(await stored()).toBe(0);
    await o2.stop();
  });

  it('pliki wysłane przed restartem nie idą drugi raz; zapis dostaje uploads', async () => {
    let online = false;
    let uploads = 0;
    const bodies: any[] = [];
    server.use(
      http.post(`${B}/api/uploads`, () => HttpResponse.json({ uploadId: `u${++uploads}` })),
      http.post(`${B}/api/diary`, async ({ request }) => {
        if (!online) return HttpResponse.error();
        bodies.push(await request.json());
        return HttpResponse.json({ id: 'd1' });
      }),
    );
    const o1 = createOutbox({ store: createStore(), ...fast });
    o1.start();
    o1.enqueue({ kind: 'wpis', url: '/api/diary', method: 'POST', body: { tekst: 'a' }, files: [new Blob(['x'], { type: 'image/jpeg' })] }).catch(() => {});
    await until(() => uploads === 1);
    await new Promise((r) => setTimeout(r, 30));
    await o1.stop();
    online = true;
    const o2 = createOutbox({ store: createStore(), ...fast });
    await o2.start();
    await until(() => o2.pending() === 0);
    expect(uploads).toBe(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ tekst: 'a', uploads: ['u1'] });
    await o2.stop();
  });

  it('401: kolejka wstrzymana, nie skasowana, zdarzenie session-expired; po zalogowaniu wysyła', async () => {
    let ok = false;
    server.use(http.post(`${B}/api/x`, () => (ok ? HttpResponse.json({ done: 1 }) : HttpResponse.json({ error: 'SESJA' }, { status: 401 }))));
    let expired = 0;
    const onExp = () => expired++;
    bus.addEventListener('session-expired', onExp);
    const o = createOutbox({ store: createStore(), ...fast });
    o.start();
    const p = o.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: {} });
    await until(() => expired === 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(o.paused).toBe(true);
    expect(o.pending()).toBe(1);
    expect(await stored()).toBe(1);
    expect(expired).toBe(1); // bez ponawiania w pauzie
    ok = true;
    o.resume();
    await expect(p).resolves.toEqual({ done: 1 });
    expect(o.pending()).toBe(0);
    bus.removeEventListener('session-expired', onExp);
    await o.stop();
  });

  it('422: zapis zdjęty z kolejki, błąd do wywołującego, optimistic cofnięte', async () => {
    server.use(http.patch(`${B}/api/jobs/a`, () => HttpResponse.json({ error: 'Zła nazwa' }, { status: 422 })));
    const store = createStore();
    store.put('jobs', { id: 'a', nazwa: 'Stara' });
    const o = createOutbox({ store, ...fast });
    o.start();
    const p = o.enqueue({
      kind: 'zlecenie', url: '/api/jobs/a', method: 'PATCH', body: { nazwa: 'Nowa' },
      optimistic: (s) => { s.put('jobs', { id: 'a', nazwa: 'Nowa' }); s.put('jobs', { id: 'b', nazwa: 'Dodane' }); },
    });
    expect(store.get('jobs', 'a')?.nazwa).toBe('Nowa');
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, message: 'Zła nazwa' });
    expect(store.get('jobs', 'a')?.nazwa).toBe('Stara');
    expect(store.get('jobs', 'b')).toBeUndefined();
    expect(o.pending()).toBe(0);
    expect(await stored()).toBe(0);
    await o.stop();
  });

  it('dwie karty offline: żadna nie kasuje zapisu drugiej; potem oba idą po kolei, każdy raz', async () => {
    let online = false;
    const got: number[] = [];
    server.use(http.post(`${B}/api/x`, async ({ request }) => {
      if (!online) return HttpResponse.error();
      got.push(((await request.json()) as { n: number }).n);
      return HttpResponse.json({});
    }));
    const a = createOutbox({ store: createStore(), ...fast });
    const b = createOutbox({ store: createStore(), ...fast });
    await a.start();
    await b.start(); // b wczytał pustą kolejkę, zanim a cokolwiek dodał
    a.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: { n: 1 } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 10));
    b.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: { n: 2 } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    await a.stop();
    await b.stop();
    expect(await stored()).toBe(2);
    online = true;
    const c = createOutbox({ store: createStore(), ...fast });
    await c.start();
    await until(() => got.length === 2);
    await new Promise((r) => setTimeout(r, 30));
    expect(got).toEqual([1, 2]);
    expect(await stored()).toBe(0);
    await c.stop();
  });

  it('utracona odpowiedź: ponowienie z tym samym opId', async () => {
    const ops: string[] = [];
    server.use(http.post(`${B}/api/x`, async ({ request }) => {
      ops.push(((await request.json()) as { opId: string }).opId);
      return ops.length === 1 ? HttpResponse.error() : HttpResponse.json({ ok: 1 });
    }));
    const o = createOutbox({ store: createStore(), ...fast });
    await o.start();
    await expect(o.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: {} })).resolves.toEqual({ ok: 1 });
    expect(ops).toHaveLength(2);
    expect(ops[1]).toBe(ops[0]);
    await o.stop();
  });

  it('429 i 408 ponawiane, nie odrzucane', async () => {
    let n = 0;
    server.use(http.post(`${B}/api/x`, () => (++n === 1 ? HttpResponse.json({}, { status: 429 }) : n === 2 ? HttpResponse.json({}, { status: 408 }) : HttpResponse.json({ ok: 1 }))));
    const o = createOutbox({ store: createStore(), ...fast });
    await o.start();
    await expect(o.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: {} })).resolves.toEqual({ ok: 1 });
    expect(n).toBe(3);
    await o.stop();
  });

  it('cofnięcie po 4xx nie nadpisuje nowszych danych z serwera', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(http.patch(`${B}/api/jobs/a`, async () => { await gate; return HttpResponse.json({ error: 'Nie' }, { status: 422 }); }));
    const store = createStore();
    store.put('jobs', { id: 'a', nazwa: 'Stara' });
    store.put('jobs', { id: 'b', nazwa: 'B stara' });
    const o = createOutbox({ store, ...fast });
    await o.start();
    const p = o.enqueue({
      kind: 'zlecenie', url: '/api/jobs/a', method: 'PATCH', body: {},
      optimistic: (s) => { s.put('jobs', { id: 'a', nazwa: 'Moja' }); s.put('jobs', { id: 'b', nazwa: 'B moja' }); },
    }).catch((e) => e);
    // w międzyczasie SSE przynosi nowszą wersję `a` od kogoś innego
    store.apply({ seq: 10, entity: 'jobs', id: 'a', action: 'update', data: { id: 'a', nazwa: 'Z serwera' } });
    release();
    expect(await p).toMatchObject({ status: 422 });
    expect(store.get('jobs', 'a')?.nazwa).toBe('Z serwera');
    expect(store.get('jobs', 'b')?.nazwa).toBe('B stara');
    await o.stop();
  });
});
