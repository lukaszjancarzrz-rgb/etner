import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
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
  const w2 = addUser(deps, { name: 'Marek' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Jan Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, a, w, site: k.site!, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
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

  it('defaultCycle ze słownika kategorii (R67): rekuperacja 6, klimatyzacja i fotowoltaika 12, pozostałe brak; zmiana w słowniku działa', async () => {
    const s = await setup();
    expect(['Rekuperacja', 'Klimatyzacja', 'Fotowoltaika', 'Elektryka', 'constructor'].map((k) => defaultCycle(s.deps.db, k))).toEqual([6, 12, 12, null, null]);
    const items = list(s.deps.db, 'kategoria').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Rekuperacja' ? 'Wentylacja' : d.wartosc, kolor: d.kolor, cyklMies: d.wartosc === 'Elektryka' ? 24 : d.cyklMies }));
    expect((await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items }))).status).toBe(200);
    expect(defaultCycle(s.deps.db, 'Wentylacja')).toBe(6); // cykl idzie za wierszem, nie za nazwą
    expect(ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Elektryka').cyklMies).toBe(24);
  });

  it('w działającej bazie (raz, w transakcji, z changes): czynności – kategoria tylko istniejąca; cykl tylko pustym kategoriom z SEED', async () => {
    const s = await setup();
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Rekuperacja' });
    // baza sprzed modułu 2: słowniki są, czynności nie
    s.deps.db.delete(dict).run();
    const ins = s.deps.db.$client.prepare("insert into dict (id, created_at, updated_at, rodzaj, wartosc, kolejnosc, cykl_mies) values (?, '', '', 'kategoria', ?, 0, ?)");
    ins.run('k1', 'Rekuperacja', null); ins.run('k2', 'Klimatyzacja', 3); ins.run('k3', 'Elektryka', null);
    seedBase(s.deps.db);
    s.deps.db.$client.prepare("update dict set cykl_mies = null where id = 'k1'").run(); // właściciel wyczyścił cykl – nie wraca
    seedBase(s.deps.db);
    const cz = list(s.deps.db, 'czynnosc_serwisowa');
    expect(cz).toHaveLength(14);
    expect(cz.find((d) => d.wartosc === 'Wymiana filtrów F7')?.kategoria).toBe('Rekuperacja');
    expect(cz.find((d) => d.wartosc === 'Przegląd falownika')?.kategoria).toBeNull(); // brak kategorii Fotowoltaika
    expect(list(s.deps.db, 'kategoria').map((d) => [d.wartosc, d.cyklMies])).toEqual([['Rekuperacja', null], ['Klimatyzacja', 3], ['Elektryka', null]]);
    expect(list(s.deps.db, 'ekipa')).toHaveLength(0); // inne rodzaje bez zmian
    expect(count(s, "select count(*) n from changes where entity = 'dict'")).toBe(15); // 14 czynności + cykl Rekuperacji
  });

  it('zmiana nazwy kategorii w słowniku zmienia nazwę teczki i kategorię czynności (R36)', async () => {
    const s = await setup();
    const f = ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Rekuperacja');
    const items = list(s.deps.db, 'kategoria').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Rekuperacja' ? 'Wentylacja' : d.wartosc, kolor: d.kolor, cyklMies: d.cyklMies }));
    expect((await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items }))).status).toBe(200);
    expect(findFolder(s.deps.db, s.site.id, 'Wentylacja')?.id).toBe(f.id);
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Wentylacja' });
    expect(count(s, `select count(*) n from changes where entity = 'passport_folders' and action = 'update'`)).toBe(1);
  });

  it('„Zamień na…”: teczki obiektu scalają się (urządzenia, wpisy, pliki, termin, notatka), czynności bez duplikatów', async () => {
    const s = await setup();
    const site2 = (await import('../klienci/service.js')).addSite(s.deps.db, s.a.user.id, s.site.clientId, { adres: 'Długa 2' })!;
    const kl = (await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Klimatyzacja' })).body;
    await call(s, s.admin, 'PUT', `/api/folders/${kl.id}`, { nastepnySerwis: '2027-06-01', notatkaRozliczenie: 'Klima zapłacona', cyklMies: null });
    const rek = (await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Rekuperacja' })).body;
    await call(s, s.admin, 'PUT', `/api/folders/${rek.id}`, { nastepnySerwis: '2027-05-01', notatkaRozliczenie: 'Reku zapłacona' });
    const rek2 = (await call(s, s.admin, 'POST', '/api/folders', { siteId: site2.id, kategoria: 'Rekuperacja' })).body;
    const dev = (await call(s, s.worker, 'POST', '/api/devices', { folderId: rek.id, nazwa: 'Rekuperator', dlaKlienta: true })).body;
    const e = (await call(s, s.worker, 'POST', '/api/service-entries', { folderId: rek.id, dzien: '2026-11-03', czynnosci: ['Wymiana filtrów F7'], dlaKlienta: true, uploadIds: [await upload(s, s.worker)] })).body;
    const doc = await upload(s, s.worker, pdf(), 'i.pdf');
    await call(s, s.worker, 'POST', '/api/folder-files', { folderId: rek.id, uploadId: doc, typDok: 'instrukcja', dlaKlienta: true });

    const items = list(s.deps.db, 'kategoria').filter((d) => d.wartosc !== 'Rekuperacja').map((d) => ({ id: d.id, wartosc: d.wartosc, kolor: d.kolor, cyklMies: d.cyklMies }));
    const r = await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items, zamien: { Rekuperacja: 'Klimatyzacja' } }));
    expect(r.status).toBe(200);
    expect(findFolder(s.deps.db, s.site.id, 'Klimatyzacja')).toMatchObject({ id: kl.id, nastepnySerwis: '2027-05-01', cyklMies: 6, notatkaRozliczenie: 'Klima zapłacona\n\nReku zapłacona' });
    expect(findFolder(s.deps.db, site2.id, 'Klimatyzacja')?.id).toBe(rek2.id); // bez teczki docelowej: zmiana nazwy
    expect(count(s, `select count(*) n from passport_folders where id = '${rek.id}' and deleted_at is not null`)).toBe(1);
    expect(s.deps.db.$client.prepare('select folder_id f from devices').get()).toEqual({ f: kl.id });
    expect(s.deps.db.$client.prepare('select folder_id f from service_entries').get()).toEqual({ f: kl.id });
    expect(s.deps.db.$client.prepare(`select owner_id o from attachments where id = '${doc}'`).get()).toEqual({ o: kl.id });
    const t = (await teczki(s, s.admin)).find((x) => x.kategoria === 'Klimatyzacja');
    expect(t).toMatchObject({ photos: 1, docs: 1 });
    // telefon pracownika: przeniesienia i usunięcie źródłowej teczki
    const ch = (await call(s, s.worker, 'GET', '/api/changes?since=0')).body.changes as any[];
    expect(ch.some((c) => c.entity === 'passport_folders' && c.id === rek.id && c.action === 'delete')).toBe(true);
    expect(ch.filter((c) => (c.id === dev.id || c.id === e.id) && c.action === 'update').map((c) => c.data.folderId)).toEqual([kl.id, kl.id]);
    // czynność „Kontrola odpływu skroplin” była w obu kategoriach – zostaje jedna
    const cz = list(s.deps.db, 'czynnosc_serwisowa').filter((d) => d.kategoria === 'Klimatyzacja').map((d) => d.wartosc);
    expect(cz.filter((w) => w === 'Kontrola odpływu skroplin')).toHaveLength(1);
    expect(cz).toContain('Wymiana filtrów F7');
    // zapis z kolejki do scalonej teczki: 404, nie błąd serwera
    expect((await call(s, s.worker, 'POST', '/api/service-entries', { folderId: rek.id, dzien: '2026-11-04', uwagi: 'x', dlaKlienta: true })).status).toBe(404);
  });

  it('PUT czynności: unikalne w kategorii (ta sama nazwa w dwóch kategoriach dozwolona), zapis seeda bez zmian → 200', async () => {
    const s = await setup();
    const put = (items: unknown[]) => s.app.request('/api/dict/czynnosc_serwisowa', req(s.admin, 'PUT', { items }));
    const seeded = list(s.deps.db, 'czynnosc_serwisowa').map((d) => ({ id: d.id, wartosc: d.wartosc, kategoria: d.kategoria }));
    const n = count(s, "select count(*) n from changes where entity = 'dict'");
    expect((await put(seeded)).status).toBe(200);
    expect(count(s, "select count(*) n from changes where entity = 'dict'")).toBe(n); // nic się nie zmieniło
    expect((await put([...seeded, { wartosc: 'Odgrzybianie', kategoria: 'Klimatyzacja' }])).status).toBe(400);
    expect((await put([...seeded, { wartosc: 'Odgrzybianie', kategoria: 'Rekuperacja' }])).status).toBe(200);
    // zmiana nazwy na istniejącą w tej samej kategorii → 400
    const now = list(s.deps.db, 'czynnosc_serwisowa').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Odgrzybianie' && d.kategoria === 'Rekuperacja' ? 'Dezynfekcja kanałów' : d.wartosc, kategoria: d.kategoria }));
    expect((await put(now)).status).toBe(400);
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
    // typ dokumentu ustawiony po dodaniu (w dzienniku): zmiana „update” → pracownik dostaje „delete”
    expect((await call(s, s.admin, 'PATCH', `/api/attachments/${fv}`, { opId: 'op-fv', typDok: 'faktura' })).body).toMatchObject({ typDok: 'faktura' });

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

describe('paszport – urządzenia, karta serwisowa, dokumenty', () => {
  const entry = (s: S, cookie: string, over: Record<string, unknown> = {}) =>
    call(s, cookie, 'POST', '/api/service-entries', { siteId: s.site.id, kategoria: 'Rekuperacja', dzien: '2026-11-03', czynnosci: ['Wymiana filtrów F7'], dlaKlienta: true, ...over });

  it('wpis serwisowy do obiektu bez teczki tworzy teczkę i ustawia następny serwis; powtórka opId bez duplikatu', async () => {
    const s = await setup();
    const j = job(s, 'Rekuperacja');
    const photo = await upload(s, s.worker);
    const r = await entry(s, s.worker, { opId: 'op-1', jobId: j.id, uwagi: 'Filtry mocno zabrudzone', nastepnySerwis: '2027-05-03', uploadIds: [photo] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dzien: '2026-11-03', jobId: j.id, czynnosci: ['Wymiana filtrów F7'], uwagi: 'Filtry mocno zabrudzone', authorId: s.w.user.id, dlaKlienta: true });
    expect(findFolder(s.deps.db, s.site.id, 'Rekuperacja')).toMatchObject({ id: r.body.folderId, nastepnySerwis: '2027-05-03', cyklMies: 6 });
    expect((await entry(s, s.worker, { opId: 'op-1', jobId: j.id, uwagi: 'Filtry mocno zabrudzone', nastepnySerwis: '2027-05-03', uploadIds: [photo] })).body).toEqual(r.body);
    expect(count(s, 'select count(*) n from service_entries')).toBe(1);
    expect(count(s, 'select count(*) n from passport_folders')).toBe(1);
    expect(s.deps.db.$client.prepare('select owner_type, owner_id from attachments').get()).toEqual({ owner_type: 'service', owner_id: r.body.id });
    expect((await teczki(s, s.worker))[0]).toMatchObject({ photos: 1, nastepnySerwis: '2027-05-03' });
    expect((await s.app.request(`/api/attachments/${photo}/file`, req(s.worker2, 'GET'))).status).toBe(302);
    // wpis bez następnego serwisu nie kasuje terminu
    await entry(s, s.admin, { dzien: '2026-11-04' });
    expect(findFolder(s.deps.db, s.site.id, 'Rekuperacja')?.nastepnySerwis).toBe('2027-05-03');
  });

  it('dwa różne opId (dwa telefony offline) dla tej samej teczki → jedna teczka, dwa wpisy (RF #3)', async () => {
    const s = await setup();
    const [a, b] = await Promise.all([entry(s, s.worker, { opId: 'op-a' }), entry(s, s.worker2, { opId: 'op-b', kategoria: 'Rekuperacja' })]);
    expect(a.status).toBe(200);
    expect(b.body.folderId).toBe(a.body.folderId);
    expect(count(s, 'select count(*) n from passport_folders')).toBe(1);
    expect(count(s, 'select count(*) n from service_entries')).toBe(2);
  });

  it('walidacja: zlecenie z innego obiektu, obce zdjęcie, pusty wpis, nieznana kategoria → 400', async () => {
    const s = await setup();
    const site2 = (await import('../klienci/service.js')).addSite(s.deps.db, s.a.user.id, s.site.clientId, { adres: 'Długa 2' })!;
    const j2 = job(s, 'Rekuperacja', 'serwis', site2.id);
    expect((await entry(s, s.worker, { jobId: j2.id })).status).toBe(400);
    expect((await entry(s, s.worker, { uploadIds: [await upload(s, s.admin)] })).status).toBe(400);
    expect((await entry(s, s.worker, { czynnosci: [] })).status).toBe(400);
    expect((await entry(s, s.worker, { kategoria: 'Nie ma' })).status).toBe(400);
    expect(count(s, 'select count(*) n from passport_folders')).toBe(0); // nieudany zapis nie zostawia teczki
  });

  it('edycja i usuwanie wpisu: admin i autor; cudzy 403; usunięcie miękkie razem ze zdjęciami, powtórka 200', async () => {
    const s = await setup();
    const photo = await upload(s, s.worker);
    const e = (await entry(s, s.worker, { uploadIds: [photo] })).body;
    expect((await call(s, s.worker2, 'PUT', `/api/service-entries/${e.id}`, { uwagi: 'x' })).status).toBe(403);
    expect((await call(s, s.worker2, 'DELETE', `/api/service-entries/${e.id}`)).status).toBe(403);
    const p2 = await upload(s, s.worker);
    expect((await call(s, s.worker, 'PUT', `/api/service-entries/${e.id}`, { opId: 'op-e', czynnosci: ['Wymiana filtrów G4', 'Inne: mycie kratek'], uploadIds: [p2] })).body)
      .toMatchObject({ czynnosci: ['Wymiana filtrów G4', 'Inne: mycie kratek'], dzien: '2026-11-03', dlaKlienta: true });
    expect((await call(s, s.admin, 'PUT', `/api/service-entries/${e.id}`, { dlaKlienta: false })).body).toMatchObject({ dlaKlienta: false });
    expect(count(s, "select count(*) n from attachments where owner_type = 'service' and deleted_at is null")).toBe(2);
    expect((await call(s, s.worker, 'DELETE', `/api/service-entries/${e.id}`)).status).toBe(200);
    expect(count(s, "select count(*) n from attachments where owner_type = 'service' and deleted_at is null")).toBe(0);
    expect(count(s, "select count(*) n from service_entries where deleted_at is not null")).toBe(1);
    expect((await call(s, s.worker, 'DELETE', `/api/service-entries/${e.id}`)).status).toBe(200);
    expect((await call(s, s.worker, 'PUT', `/api/service-entries/${e.id}`, { uwagi: 'x' })).status).toBe(404);
    expect((await call(s, s.worker, 'DELETE', '/api/service-entries/nie-ma')).status).toBe(404);
  });

  it('urządzenia: dodaje każdy (tworzy teczkę), edytuje i usuwa admin albo autor', async () => {
    const s = await setup();
    const j = job(s, 'Rekuperacja', 'montaż');
    const d = (await call(s, s.worker, 'POST', '/api/devices', { opId: 'op-d', siteId: s.site.id, kategoria: 'Rekuperacja', nazwa: 'Rekuperator', producent: 'Zehnder', model: 'ComfoAir Q350', nrSeryjny: 'SN123', montaz: '2026-10-01', jobId: j.id, gwarancjaDo: '2031-10-01', dlaKlienta: true })).body;
    expect(d).toMatchObject({ nazwa: 'Rekuperator', model: 'ComfoAir Q350', uwagi: '', createdBy: s.w.user.id, folderId: findFolder(s.deps.db, s.site.id, 'Rekuperacja')!.id });
    expect((await call(s, s.worker, 'POST', '/api/devices', { opId: 'op-d', siteId: s.site.id, kategoria: 'Rekuperacja', nazwa: 'Rekuperator', dlaKlienta: true })).body).toEqual(d);
    expect((await call(s, s.worker2, 'PUT', `/api/devices/${d.id}`, { model: 'Q450' })).status).toBe(403);
    expect((await call(s, s.admin, 'PUT', `/api/devices/${d.id}`, { model: 'Q450', gwarancjaDo: null })).body).toMatchObject({ model: 'Q450', gwarancjaDo: null, producent: 'Zehnder' });
    expect((await call(s, s.worker, 'PUT', `/api/devices/${d.id}`, { nazwa: '' })).status).toBe(400);
    expect((await call(s, s.worker2, 'DELETE', `/api/devices/${d.id}`)).status).toBe(403);
    expect((await call(s, s.worker, 'DELETE', `/api/devices/${d.id}`)).status).toBe(200);
    expect((await call(s, s.worker, 'DELETE', `/api/devices/${d.id}`)).status).toBe(200);
    expect(count(s, 'select count(*) n from devices where deleted_at is null')).toBe(0);
    expect((await call(s, s.worker, 'GET', '/api/snapshot')).body.records.some((r: any) => r.entity === 'devices')).toBe(false);
  });

  it('dokumenty teczki: faktura tylko admin; plik w teczce z typem i „dla klienta”, widoczny w teczce', async () => {
    const s = await setup();
    const file = (cookie: string, uploadId: string, over: Record<string, unknown> = {}) =>
      call(s, cookie, 'POST', '/api/folder-files', { siteId: s.site.id, kategoria: 'Klimatyzacja', uploadId, typDok: 'instrukcja', dlaKlienta: true, ...over });
    const fvW = await upload(s, s.worker, pdf(), 'fv.pdf');
    expect((await file(s.worker, fvW, { typDok: 'faktura' })).status).toBe(403);
    expect(count(s, 'select count(*) n from passport_folders')).toBe(0);
    const inst = await upload(s, s.worker, pdf(), 'instrukcja.pdf');
    const a = (await file(s.worker, inst, { opId: 'op-i' })).body;
    expect(a).toMatchObject({ id: inst, ownerType: 'teczka', ownerId: findFolder(s.deps.db, s.site.id, 'Klimatyzacja')!.id, typDok: 'instrukcja', dlaKlienta: true });
    expect((await file(s.worker, inst, { opId: 'op-i' })).body).toEqual(a);
    expect((await file(s.worker, inst)).status).toBe(400); // już podpięty
    const fv = await upload(s, s.admin, pdf(), 'fv.pdf');
    expect((await file(s.admin, fv, { typDok: 'faktura', dlaKlienta: false })).status).toBe(200);
    expect((await teczki(s, s.worker))[0]).toMatchObject({ kategoria: 'Klimatyzacja', docs: 1 });
    expect((await teczki(s, s.admin))[0]).toMatchObject({ docs: 2 });
    const snap = (await call(s, s.worker2, 'GET', '/api/snapshot')).body.records as any[];
    expect(snap.filter((r) => r.entity === 'attachments').map((r) => r.id)).toEqual([inst]);
    expect((await s.app.request(`/api/attachments/${inst}/file`, req(s.worker2, 'GET'))).status).toBe(302);
    expect((await s.app.request(`/api/attachments/${fv}/file`, req(s.worker2, 'GET'))).status).toBe(404);
  });

  it('pliki i zdjęcia dodane w teczce: domyślnie w paszporcie dla klienta; faktura zawsze wewnętrzna', async () => {
    const s = await setup();
    const file = (cookie: string, uploadId: string, over: Record<string, unknown> = {}) =>
      call(s, cookie, 'POST', '/api/folder-files', { siteId: s.site.id, kategoria: 'Klimatyzacja', uploadId, typDok: 'instrukcja', ...over });
    expect((await file(s.worker, await upload(s, s.worker, pdf(), 'i.pdf'))).body).toMatchObject({ dlaKlienta: true });
    expect((await file(s.admin, await upload(s, s.admin, pdf(), 'p.pdf'), { dlaKlienta: false })).body).toMatchObject({ dlaKlienta: false });
    const fv = (await file(s.admin, await upload(s, s.admin, pdf(), 'fv.pdf'), { typDok: 'faktura', dlaKlienta: true })).body;
    expect(fv).toMatchObject({ typDok: 'faktura', dlaKlienta: false });
    expect((await call(s, s.admin, 'PATCH', `/api/attachments/${fv.id}`, { dlaKlienta: true })).body).toMatchObject({ dlaKlienta: false });
    const doc = (await file(s.admin, await upload(s, s.admin, pdf(), 'o.pdf'))).body;
    expect((await call(s, s.admin, 'PATCH', `/api/attachments/${doc.id}`, { typDok: 'faktura' })).body).toMatchObject({ typDok: 'faktura', dlaKlienta: false });
    const photo = await upload(s, s.worker);
    await call(s, s.worker, 'POST', '/api/service-entries', { siteId: s.site.id, kategoria: 'Klimatyzacja', dzien: '2026-11-03', dlaKlienta: true, uploadIds: [photo] });
    expect(s.deps.db.$client.prepare(`select dla_klienta d from attachments where id = '${photo}'`).get()).toEqual({ d: 1 });
    // „+ Zdjęcie” w teczce: bez typu dokumentu, liczy się do zdjęć, nie do dokumentów
    const fp = (await file(s.worker, await upload(s, s.worker), { typDok: undefined })).body;
    expect(fp).toMatchObject({ rodzaj: 'zdjecie', typDok: null, dlaKlienta: true });
    expect((await teczki(s, s.admin)).find((x) => x.kategoria === 'Klimatyzacja')).toMatchObject({ photos: 2, docs: 4 });
    // dziennik zlecenia bez zmian: domyślnie wewnętrzne
    const j = job(s, 'Klimatyzacja');
    const dp = await upload(s, s.admin);
    expect((await diary(s, s.admin, j.id, [dp])).status).toBe(200);
    expect(s.deps.db.$client.prepare(`select owner_type o, dla_klienta d from attachments where id = '${dp}'`).get()).toEqual({ o: 'entry', d: 0 });
  });
});

describe('paszport – pliki: typ dokumentu, dla klienta, usuwanie', () => {
  it('PATCH załącznika: dla klienta admin; typ dokumentu admin albo autor, faktura tylko admin; stare „dla_klienta” działa', async () => {
    const s = await setup();
    const j = job(s, 'Rekuperacja');
    const mine = await upload(s, s.worker, pdf(), 'p.pdf');
    await diary(s, s.worker, j.id, [mine]);
    const doc = await upload(s, s.worker2, pdf(), 'i.pdf');
    await call(s, s.worker2, 'POST', '/api/folder-files', { siteId: s.site.id, kategoria: 'Rekuperacja', uploadId: doc, typDok: 'inne', dlaKlienta: false });
    const patch = (cookie: string, id: string, b: unknown) => call(s, cookie, 'PATCH', `/api/attachments/${id}`, b);
    expect((await patch(s.worker, mine, { typDok: 'projekt' })).body).toMatchObject({ typDok: 'projekt', dlaKlienta: false });
    expect((await patch(s.worker, mine, { typDok: 'faktura' })).status).toBe(403);
    expect((await patch(s.worker, mine, { dlaKlienta: true })).status).toBe(403);
    expect((await patch(s.worker, doc, { typDok: 'projekt' })).status).toBe(403); // cudzy plik
    expect((await patch(s.admin, doc, { dlaKlienta: true, typDok: 'oferta' })).body).toMatchObject({ dlaKlienta: true, typDok: 'oferta', ownerType: 'teczka' });
    expect((await patch(s.admin, mine, { dla_klienta: true })).body).toMatchObject({ dlaKlienta: true });
    expect((await patch(s.admin, mine, { typDok: 'faktura' })).body).toMatchObject({ typDok: 'faktura' });
    expect((await patch(s.worker, mine, { typDok: 'inne' })).status).toBe(404); // faktury pracownik nie widzi
    expect((await patch(s.admin, mine, { typDok: null })).body).toMatchObject({ typDok: null });
    expect((await patch(s.admin, 'nie-ma', { typDok: null })).status).toBe(404);
  });

  it('DELETE pliku teczki: admin albo autor, powtórka 200, faktura pracownikowi 404', async () => {
    const s = await setup();
    const add = async (cookie: string, typDok = 'instrukcja') => {
      const id = await upload(s, cookie, pdf(), 'x.pdf');
      await call(s, cookie, 'POST', '/api/folder-files', { siteId: s.site.id, kategoria: 'Rekuperacja', uploadId: id, typDok, dlaKlienta: false });
      return id;
    };
    const mine = await add(s.worker);
    const theirs = await add(s.worker2);
    const fv = await add(s.admin, 'faktura');
    expect((await call(s, s.worker, 'DELETE', `/api/folder-files/${theirs}`)).status).toBe(403);
    expect((await call(s, s.worker, 'DELETE', `/api/folder-files/${fv}`)).status).toBe(404);
    expect((await call(s, s.worker, 'DELETE', `/api/folder-files/${mine}`)).status).toBe(200);
    expect((await call(s, s.worker, 'DELETE', `/api/folder-files/${mine}`)).status).toBe(200);
    expect((await call(s, s.admin, 'DELETE', `/api/folder-files/${theirs}`)).status).toBe(200);
    expect((await call(s, s.admin, 'DELETE', '/api/folder-files/nie-ma')).status).toBe(404);
    expect(count(s, "select count(*) n from attachments where owner_type = 'teczka' and deleted_at is null")).toBe(1);
    expect((await teczki(s, s.admin))[0]).toMatchObject({ docs: 1 });
  });

  it('zapis po folderId: wpis i urządzenie trafiają do teczki także po zmianie nazwy kategorii; bez teczki → 400/404', async () => {
    const s = await setup();
    const f = (await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Rekuperacja' })).body;
    const items = list(s.deps.db, 'kategoria').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Rekuperacja' ? 'Wentylacja' : d.wartosc, kolor: d.kolor, cyklMies: d.cyklMies }));
    await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items }));
    const e = await call(s, s.worker, 'POST', '/api/service-entries', { folderId: f.id, dzien: '2026-11-03', czynnosci: ['Wymiana filtrów F7'], dlaKlienta: true, nastepnySerwis: '2027-05-03' });
    expect(e.body).toMatchObject({ folderId: f.id });
    expect(findFolder(s.deps.db, s.site.id, 'Wentylacja')?.nastepnySerwis).toBe('2027-05-03');
    expect((await call(s, s.worker, 'POST', '/api/devices', { folderId: f.id, nazwa: 'Centrala', dlaKlienta: true })).body).toMatchObject({ folderId: f.id });
    expect((await call(s, s.worker, 'POST', '/api/devices', { nazwa: 'Centrala', dlaKlienta: true })).status).toBe(400);
    expect((await call(s, s.worker, 'POST', '/api/devices', { folderId: 'nie-ma', nazwa: 'Centrala', dlaKlienta: true })).status).toBe(404);
    // teczka wpisu usunięta (np. scalona): edycja 404, nie błąd serwera
    s.deps.db.$client.prepare(`update passport_folders set deleted_at = 'x' where id = '${f.id}'`).run();
    expect((await call(s, s.worker, 'PUT', `/api/service-entries/${e.body.id}`, { jobId: null })).status).toBe(404);
  });
});

describe('łączenie obiektów (R70)', () => {
  const kl = () => import('../klienci/service.js');
  const refs = async () => (await import('../klienci/routes.js')).siteRefs;
  const psz = (s: S, id: string, siteId: string, numer: string) =>
    s.deps.db.$client.prepare("insert into passports (id, created_at, updated_at, site_id, numer) values (?, '', '', ?, ?)").run(id, siteId, numer);

  it('ręcznie: zlecenia, leady, teczki (tej samej kategorii scalone), paszport; puste pola; duplikat usunięty; powtórka bez zmian', async () => {
    const s = await setup();
    const { addSite, getSite } = await kl();
    const dup = addSite(s.deps.db, s.a.user.id, s.site.clientId, { nazwa: 'Dom', adres: 'Krotka 1.', miejscowosc: 'Zawoja', mapa: 'geo:1', opis: 'kod do bramy' })!;
    const j = job(s, 'Rekuperacja', 'serwis', dup.id);
    const keepRek = (await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Rekuperacja' })).body;
    const dupRek = (await call(s, s.admin, 'POST', '/api/folders', { siteId: dup.id, kategoria: 'Rekuperacja' })).body;
    const dupKl = (await call(s, s.admin, 'POST', '/api/folders', { siteId: dup.id, kategoria: 'Klimatyzacja' })).body;
    const dev = (await call(s, s.worker, 'POST', '/api/devices', { folderId: dupRek.id, nazwa: 'Rekuperator', dlaKlienta: true })).body;
    const doc = await upload(s, s.worker, pdf(), 'i.pdf');
    await call(s, s.worker, 'POST', '/api/folder-files', { folderId: dupRek.id, uploadId: doc, typDok: 'instrukcja', dlaKlienta: true });
    psz(s, 'p-keep', s.site.id, 'PSZ-2026-001');
    psz(s, 'p-dup', dup.id, 'PSZ-2026-002');

    expect((await call(s, s.worker, 'POST', `/api/sites/${s.site.id}/merge`, { from: dup.id })).status).toBe(403);
    const r = await call(s, s.admin, 'POST', `/api/sites/${s.site.id}/merge`, { from: dup.id, opId: 'sm1' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: s.site.id, nazwa: 'Dom', adres: 'Krótka 1', mapa: 'geo:1', opis: 'kod do bramy' });
    expect(getSite(s.deps.db, dup.id)).toBeUndefined();
    expect(zlecenia.get(s.deps.db, j.id)!.siteId).toBe(s.site.id);
    expect(findFolder(s.deps.db, s.site.id, 'Rekuperacja')!.id).toBe(keepRek.id);
    expect(findFolder(s.deps.db, s.site.id, 'Klimatyzacja')!.id).toBe(dupKl.id);
    expect(s.deps.db.$client.prepare(`select folder_id f from devices where id = '${dev.id}'`).get()).toEqual({ f: keepRek.id });
    expect(s.deps.db.$client.prepare(`select owner_id o from attachments where id = '${doc}'`).get()).toEqual({ o: keepRek.id });
    expect(count(s, "select count(*) n from passports where deleted_at is null")).toBe(1);
    expect(count(s, "select count(*) n from passports where id = 'p-keep' and deleted_at is null")).toBe(1);
    expect((await teczki(s, s.admin)).map((t) => t.kategoria).sort()).toEqual(['Klimatyzacja', 'Rekuperacja']);

    const n = count(s, 'select count(*) n from changes');
    expect((await call(s, s.admin, 'POST', `/api/sites/${s.site.id}/merge`, { from: dup.id, opId: 'sm1' })).status).toBe(200);
    expect((await call(s, s.admin, 'POST', `/api/sites/${s.site.id}/merge`, { from: dup.id })).status).toBe(200);
    expect(count(s, 'select count(*) n from changes')).toBe(n);
    // obiekt innego klienta: 400, nic nie zmienione
    const other = newClient(s.deps.db, s.a.user.id, { typ: 'osoba', nazwa: 'Inny', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'X', miejscowosc: 'Y', mapa: '', opis: '' } });
    expect((await call(s, s.admin, 'POST', `/api/sites/${s.site.id}/merge`, { from: other.site!.id })).status).toBe(400);
    expect(getSite(s.deps.db, other.site!.id)).toBeDefined();
  });

  it('dodanie identycznego obiektu zwraca istniejący; przy starcie: dokładne duplikaty łączone, drugi przebieg 0', async () => {
    const s = await setup();
    const { addSite, mergeDuplicateSites, listSites } = await kl();
    expect(addSite(s.deps.db, s.a.user.id, s.site.clientId, { adres: ' krótka  1 ', miejscowosc: 'ZAWOJA' })!.id).toBe(s.site.id);
    // duplikaty jak z przeniesienia arkusza (wstawione z pominięciem addSite) + różniący się obiekt + obiekt bez danych
    const ins = s.deps.db.$client.prepare("insert into sites (id, created_at, updated_at, client_id, nazwa, adres, miejscowosc) values (?, ?, '', ?, '', ?, ?)");
    ins.run('d1', '2030-01-01', s.site.clientId, 'Krótka 1', 'Zawoja');
    ins.run('d2', '2030-01-02', s.site.clientId, 'Krótka, 1', 'zawoja');
    ins.run('e1', '2030-01-03', s.site.clientId, '', '');
    ins.run('e2', '2030-01-04', s.site.clientId, '', '');
    ins.run('o1', '2030-01-05', s.site.clientId, 'Krótka 11', 'Zawoja');
    const j = job(s, 'Rekuperacja', 'serwis', 'd2');
    await call(s, s.admin, 'POST', '/api/folders', { siteId: 'd1', kategoria: 'Rekuperacja' });
    await call(s, s.admin, 'POST', '/api/folders', { siteId: s.site.id, kategoria: 'Rekuperacja' });
    expect(mergeDuplicateSites(s.deps.db, await refs())).toBe(2);
    expect(listSites(s.deps.db, s.site.clientId).map((x) => x.id).sort()).toEqual([s.site.id, 'e1', 'e2', 'o1'].sort());
    expect(zlecenia.get(s.deps.db, j.id)!.siteId).toBe(s.site.id);
    expect(count(s, 'select count(*) n from passport_folders where deleted_at is null')).toBe(1);
    const n = count(s, 'select count(*) n from changes');
    expect(mergeDuplicateSites(s.deps.db, await refs())).toBe(0);
    expect(count(s, 'select count(*) n from changes')).toBe(n);
  });
});
