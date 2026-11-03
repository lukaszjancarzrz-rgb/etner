import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import { attachments } from '../dziennik/schema.js';
import * as zlecenia from '../zlecenia/service.js';
import { runOp } from '../../core/ops.js';
import { dict } from '../slowniki/schema.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';
import { list } from '../slowniki/service.js';
import { defaultCycle, ensureFolder, findFolder } from './service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Bartek' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Jan Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, a, w, site: k.site!, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
type S = Awaited<ReturnType<typeof setup>>;
const count = (s: S, sql: string) => (s.deps.db.$client.prepare(sql).get() as { n: number }).n;
const call = async (s: S, cookie: string, method: string, url: string, body?: unknown) => {
  const r = await s.app.request(url, req(cookie, method, body));
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const jpeg = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
const upload = async (s: S, cookie: string, data?: Buffer, name = 'a.jpg') => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array(data ?? await jpeg())], name));
  return ((await (await s.app.request('/api/uploads', { method: 'POST', headers: { cookie }, body: fd })).json()) as { uploadId: string }).uploadId;
};
const pdf = () => Buffer.from('%PDF-1.4 test');
const job = (s: S, kategoria: string, rodzaj = 'serwis', siteId = s.site.id) =>
  zlecenia.save(s.deps.db, s.a.user.id, { clientId: s.site.clientId, siteId, status: 'Nowe', kategoria, rodzaj } as never)!;
const diary = (s: S, cookie: string, jobId: string, uploads: string[]) =>
  s.app.request('/api/diary', req(cookie, 'POST', { owner_type: 'job', owner_id: jobId, tekst: 'Zdjęcia', uploads }));
const teczki = async (s: S, cookie: string, siteId = s.site.id) => (await call(s, cookie, 'GET', `/api/sites/${siteId}/teczki`)).body as any[];

describe('paszport – dane', () => {
  it('ensureFolder: drugi raz (także dwa runOp z różnymi opId) zwraca tę samą teczkę, z domyślnym cyklem', async () => {
    const s = await setup();
    const f1 = ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Rekuperacja');
    expect(f1).toMatchObject({ siteId: s.site.id, kategoria: 'Rekuperacja', cyklMies: 6, przypomnienia: true, notatkaRozliczenie: '' });
    expect(ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Rekuperacja').id).toBe(f1.id);
    const r1 = runOp(s.deps.db, 'op-a', s.w.user.id, () => ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Klimatyzacja'));
    const r2 = runOp(s.deps.db, 'op-b', s.a.user.id, () => ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Klimatyzacja'));
    expect(r2.result.id).toBe(r1.result.id);
    expect(count(s, "select count(*) n from passport_folders where kategoria = 'Klimatyzacja'")).toBe(1);
    expect(count(s, "select count(*) n from changes where entity = 'passport_folders'")).toBe(2);
    expect(() => ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Nie ma')).toThrow('Nieznana kategoria');
    expect(() => ensureFolder(s.deps.db, s.a.user.id, 'brak', 'Elektryka')).toThrow('Nie znaleziono obiektu');
    // baza też pilnuje jednej aktywnej teczki
    expect(() => s.deps.db.$client.prepare("insert into passport_folders (id, created_at, updated_at, site_id, kategoria) values ('x', '', '', ?, 'Rekuperacja')").run(s.site.id)).toThrow(/UNIQUE/);
  });

  it('defaultCycle: rekuperacja 6, klimatyzacja i fotowoltaika 12, pozostałe brak', () => {
    expect(defaultCycle('Rekuperacja')).toBe(6);
    expect(defaultCycle('Klimatyzacja')).toBe(12);
    expect(defaultCycle('Fotowoltaika')).toBe(12);
    expect(defaultCycle('Elektryka')).toBeNull();
    expect(defaultCycle('constructor')).toBeNull();
  });

  it('słownik czynności serwisowych z kategorią; w działającej bazie dosiewany raz, z wpisami w changes', async () => {
    const s = await setup();
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Rekuperacja' });
    // baza sprzed modułu 2: słowniki są, czynności nie
    s.deps.db.delete(dict).run();
    s.deps.db.$client.prepare("insert into dict (id, created_at, updated_at, rodzaj, wartosc, kolejnosc) values ('k1', '', '', 'kategoria', 'Elektryka', 0)").run();
    seedBase(s.deps.db);
    seedBase(s.deps.db);
    expect(list(s.deps.db, 'czynnosc_serwisowa')).toHaveLength(14);
    expect(list(s.deps.db, 'ekipa')).toHaveLength(0); // inne rodzaje bez zmian
    expect(count(s, "select count(*) n from changes where entity = 'dict'")).toBe(14);
  });

  it('zmiana nazwy kategorii w słowniku zmienia nazwę teczki i kategorię czynności (R36)', async () => {
    const s = await setup();
    const f = ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Rekuperacja');
    const items = list(s.deps.db, 'kategoria').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Rekuperacja' ? 'Wentylacja' : d.wartosc, kolor: d.kolor }));
    expect((await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items }))).status).toBe(200);
    expect(findFolder(s.deps.db, s.site.id, 'Wentylacja')?.id).toBe(f.id);
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Wentylacja' });
    expect(count(s, `select count(*) n from changes where entity = 'passport_folders' and action = 'update'`)).toBe(1);
  });

  it('PUT czynności: kategoria zostaje zapisana, nieznana kategoria → 400', async () => {
    const s = await setup();
    const put = (items: unknown[]) => s.app.request('/api/dict/czynnosc_serwisowa', req(s.admin, 'PUT', { items }));
    expect((await put([{ wartosc: 'Mycie', kategoria: 'Nie ma' }])).status).toBe(400);
    expect(await (await put([{ wartosc: 'Mycie', kategoria: 'Klimatyzacja' }])).json()).toMatchObject([{ wartosc: 'Mycie', kategoria: 'Klimatyzacja' }]);
  });
});

describe('paszport – teczki z danych zleceń', () => {
  it('montaż i dwa serwisy Rekuperacji + Elektryka → dwie teczki; inne obiekty klienta osobno (RF #5)', async () => {
    const s = await setup();
    const site2 = (await import('../klienci/service.js')).addSite(s.deps.db, s.a.user.id, s.site.clientId, { adres: 'Długa 2', miejscowosc: 'Maków' })!;
    const rek = [job(s, 'Rekuperacja', 'montaż'), job(s, 'Rekuperacja'), job(s, 'Rekuperacja')];
    const el = job(s, 'Elektryka', 'montaż');
    job(s, 'Rekuperacja', 'montaż', site2.id);
    await diary(s, s.worker, rek[0]!.id, [await upload(s, s.worker), await upload(s, s.worker)]);
    await diary(s, s.worker, rek[2]!.id, [await upload(s, s.worker), await upload(s, s.worker, pdf(), 'projekt.pdf')]);
    await diary(s, s.worker, el.id, [await upload(s, s.worker)]);
    const t = await teczki(s, s.worker);
    expect(t.map((x) => x.kategoria)).toEqual(['Elektryka', 'Rekuperacja']); // kolejność słownika
    expect(t[1]).toMatchObject({ jobIds: rek.map((j) => j.id), photos: 3, docs: 1 });
    expect(t[1].folder).toBeUndefined();
    expect(t[0]).toMatchObject({ jobIds: [el.id], photos: 1, docs: 0 });
    expect((await teczki(s, s.worker, site2.id)).map((x) => [x.kategoria, x.jobIds.length])).toEqual([['Rekuperacja', 1]]);
    expect((await call(s, s.worker, 'GET', '/api/sites/nie-ma/teczki')).status).toBe(404);
  });

  it('zmiana kategorii lub obiektu zlecenia przenosi je razem ze zdjęciami do innej teczki (RF #1)', async () => {
    const s = await setup();
    const a = job(s, 'Rekuperacja', 'montaż');
    const b = job(s, 'Rekuperacja');
    await diary(s, s.worker, b.id, [await upload(s, s.worker), await upload(s, s.worker)]);
    zlecenia.save(s.deps.db, s.a.user.id, { id: b.id, kategoria: 'Klimatyzacja' } as never);
    let t = await teczki(s, s.admin);
    expect(t.map((x) => [x.kategoria, x.jobIds, x.photos])).toEqual([['Rekuperacja', [a.id], 0], ['Klimatyzacja', [b.id], 2]]);
    const site2 = (await import('../klienci/service.js')).addSite(s.deps.db, s.a.user.id, s.site.clientId, { adres: 'Długa 2' })!;
    zlecenia.save(s.deps.db, s.a.user.id, { id: b.id, siteId: site2.id } as never);
    t = await teczki(s, s.admin);
    expect(t.map((x) => x.kategoria)).toEqual(['Rekuperacja']);
    expect((await teczki(s, s.admin, site2.id)).map((x) => [x.kategoria, x.photos])).toEqual([['Klimatyzacja', 2]]);
  });

  it('pusta teczka (POST /api/folders, admin, idempotentnie) i ustawienia teczki; rozliczenie tylko admin', async () => {
    const s = await setup();
    expect((await call(s, s.worker, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Fotowoltaika' })).status).toBe(403);
    const f = (await call(s, s.admin, 'POST', '/api/folders', { opId: 'op-f', siteId: s.site.id, kategoria: 'Fotowoltaika' })).body;
    expect(f).toMatchObject({ kategoria: 'Fotowoltaika', cyklMies: 12 });
    expect((await call(s, s.admin, 'POST', '/api/folders', { opId: 'op-f2', siteId: s.site.id, kategoria: 'Fotowoltaika' })).body.id).toBe(f.id);
    expect((await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Nie ma' })).status).toBe(400);
    expect((await teczki(s, s.worker)).map((x) => [x.kategoria, x.jobIds, x.folder?.id])).toEqual([['Fotowoltaika', [], f.id]]);

    expect((await call(s, s.worker, 'PUT', `/api/folders/${f.id}`, { notatkaRozliczenie: 'Zapłacone 12 000 zł' })).status).toBe(403);
    const w = await call(s, s.worker, 'PUT', `/api/folders/${f.id}`, { opId: 'op-u', nastepnySerwis: '2027-05-01', przypomnienia: false });
    expect(w.body).toMatchObject({ nastepnySerwis: '2027-05-01', przypomnienia: false, cyklMies: 12 });
    expect(w.body).not.toHaveProperty('notatkaRozliczenie');
    expect((await call(s, s.admin, 'PUT', `/api/folders/${f.id}`, { notatkaRozliczenie: 'Zapłacone 12 000 zł', cyklMies: null })).body).toMatchObject({ notatkaRozliczenie: 'Zapłacone 12 000 zł', cyklMies: null, nastepnySerwis: '2027-05-01' });
    expect((await call(s, s.worker, 'PUT', `/api/folders/${f.id}`, { nastepnySerwis: '2027-02-30' })).status).toBe(400);
    expect((await call(s, s.worker, 'PUT', '/api/folders/nie-ma', { przypomnienia: true })).status).toBe(404);
    const [tw] = await teczki(s, s.worker);
    expect(tw).toMatchObject({ nastepnySerwis: '2027-05-01' });
    expect(tw.folder).not.toHaveProperty('notatkaRozliczenie');
    expect((await teczki(s, s.admin))[0].folder).toMatchObject({ notatkaRozliczenie: 'Zapłacone 12 000 zł' });
  });

  it('synchronizacja: pracownik bez notatki z rozliczeniem i bez faktur (snapshot i changes); admin wszystko', async () => {
    const s = await setup();
    const j = job(s, 'Rekuperacja');
    const f = (await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Rekuperacja' })).body;
    await call(s, s.admin, 'PUT', `/api/folders/${f.id}`, { notatkaRozliczenie: 'Rabat 10%' });
    const fv = await upload(s, s.admin, pdf(), 'fv.pdf');
    const proj = await upload(s, s.admin, pdf(), 'projekt.pdf');
    await diary(s, s.admin, j.id, [fv, proj]);
    // typ dokumentu ustawiony po dodaniu (np. w dzienniku): zmiana „update” → pracownik dostaje „delete”
    const old = s.deps.db.select().from(attachments).where(eq(attachments.id, fv)).get()!;
    const row = s.deps.db.update(attachments).set({ typDok: 'faktura' }).where(eq(attachments.id, fv)).returning().get();
    recordChange(s.deps.db, s.a.user.id, 'attachments', fv, 'update', old, row);

    const snap = (await call(s, s.worker, 'GET', '/api/snapshot')).body.records as any[];
    const folder = snap.find((r) => r.entity === 'passport_folders');
    expect(folder.data).toMatchObject({ id: f.id, kategoria: 'Rekuperacja' });
    expect(folder.data).not.toHaveProperty('notatkaRozliczenie');
    expect(snap.filter((r) => r.entity === 'attachments').map((r) => r.id)).toEqual([proj]);
    const ch = (await call(s, s.worker, 'GET', '/api/changes?since=0')).body.changes as any[];
    expect(ch.filter((c) => c.entity === 'passport_folders').every((c) => !('notatkaRozliczenie' in c.data))).toBe(true);
    expect(ch.filter((c) => c.entity === 'attachments' && c.id === fv).map((c) => [c.action, c.data])).toEqual([['create', expect.objectContaining({ typDok: null })], ['delete', null]]);
    expect(JSON.stringify(ch)).not.toContain('Rabat');
    const t = await teczki(s, s.worker);
    expect(t[0]).toMatchObject({ docs: 1 });
    expect((await s.app.request(`/api/attachments/${fv}/file`, req(s.worker, 'GET'))).status).toBe(404);
    expect((await s.app.request(`/api/attachments/${fv}/file`, req(s.admin, 'GET'))).status).toBe(302);

    const asnap = (await call(s, s.admin, 'GET', '/api/snapshot')).body.records as any[];
    expect(asnap.find((r) => r.entity === 'passport_folders').data).toMatchObject({ notatkaRozliczenie: 'Rabat 10%' });
    expect(asnap.filter((r) => r.entity === 'attachments')).toHaveLength(2);
    expect((await teczki(s, s.admin))[0]).toMatchObject({ docs: 2 });
  });
});
