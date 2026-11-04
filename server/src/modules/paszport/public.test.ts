import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import * as zlecenia from '../zlecenia/service.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin Adamski' });
  const w = addUser(deps, { name: 'Bartek Technikowski' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Jan <script>alert(1)</script> Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, a, site: k.site!, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
type S = Awaited<ReturnType<typeof setup>>;
const call = async (s: S, cookie: string, method: string, url: string, body?: unknown) => {
  const r = await s.app.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return (await r.json()) as any;
};
const upload = async (s: S, cookie: string, data: Buffer, name: string) => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array(data)], name));
  return ((await (await s.app.request('/api/uploads', { method: 'POST', headers: { cookie }, body: fd })).json()) as { uploadId: string }).uploadId;
};
const jpeg = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
const pdf = Buffer.from('%PDF-1.4 test');
let ipSeq = 0;
/** `ip` = wpis dopisany przez proxy (ostatni); `forged` = to, co podał sam klient. */
const page = (s: S, token: string, ip = `10.0.${ipSeq >> 8}.${++ipSeq & 255}`, forged = '1.1.1.1') => s.app.request(`/p/${token}`, { headers: { 'x-forwarded-for': `${forged}, ${ip}` } });

/** Paszport z treścią dla klienta i wewnętrzną (każda wewnętrzna z rozpoznawalnym napisem TAJNE). */
async function filled(s: S) {
  await call(s, s.admin, 'PUT', '/api/settings/firma', { nazwa: 'ETNER Instalacje', telefon: '600 100 200', email: 'serwis@example.com', www: 'example.com' });
  const p = await call(s, s.worker, 'POST', '/api/passports', { siteId: s.site.id });
  const j = zlecenia.save(s.deps.db, s.a.user.id, { clientId: s.site.clientId, siteId: s.site.id, status: 'Nowe', kategoria: 'Alarmy i monitoring', rodzaj: 'serwis' } as never)!;
  const t = { siteId: s.site.id, kategoria: 'Klimatyzacja' };
  await call(s, s.worker, 'POST', '/api/devices', { ...t, nazwa: 'Klimatyzator salon', producent: 'Daikin', model: 'FTXM35', montaz: '2026-05-10', gwarancjaDo: '2031-05-10', dlaKlienta: true });
  await call(s, s.worker, 'POST', '/api/devices', { ...t, nazwa: 'Urządzenie TAJNE', dlaKlienta: false });
  await call(s, s.worker, 'POST', '/api/service-entries', { ...t, dzien: '2026-10-01', czynnosci: ['Czyszczenie filtrów'], uwagi: 'Wszystko sprawne', dlaKlienta: true, nastepnySerwis: '2026-11-20' });
  await call(s, s.worker, 'POST', '/api/service-entries', { ...t, dzien: '2026-10-02', uwagi: 'Wpis TAJNE', dlaKlienta: false });
  await call(s, s.worker, 'POST', '/api/folder-files', { ...t, uploadId: await upload(s, s.worker, pdf, 'instrukcja-klima.pdf'), typDok: 'instrukcja' });
  await call(s, s.worker, 'POST', '/api/folder-files', { ...t, uploadId: await upload(s, s.worker, pdf, 'projekt-TAJNE.pdf'), typDok: 'projekt', dlaKlienta: false });
  await call(s, s.admin, 'POST', '/api/folder-files', { ...t, uploadId: await upload(s, s.admin, pdf, 'faktura-TAJNE.pdf'), typDok: 'faktura' });
  await call(s, s.worker, 'POST', '/api/folder-files', { ...t, uploadId: await upload(s, s.worker, await jpeg(), 'jednostka.jpg') });
  s.deps.db.$client.prepare("update passport_folders set notatka_rozliczenie = 'Rozliczenie TAJNE 1500 zł'").run();
  // dziennik zlecenia: tekst nigdy (R69), zdjęcie tylko oznaczone
  const ph = await upload(s, s.worker, await jpeg(), 'z-dziennika.jpg');
  await s.app.request('/api/diary', { method: 'POST', headers: { cookie: s.worker, 'content-type': 'application/json' }, body: JSON.stringify({ owner_type: 'job', owner_id: j.id, tekst: 'Dziennik TAJNE', uploads: [ph] }) });
  return { p, j, ph };
}

describe('strona klienta /p/:token', () => {
  it('tylko elementy dla klienta, bez nazwisk pracowników, kwot i notatek; sekcje teczek z kotwicą slug', async () => {
    const s = await setup();
    const { p, ph } = await filled(s);
    await call(s, s.admin, 'PATCH', `/api/attachments/${ph}`, { dlaKlienta: true });
    const r = await page(s, p.token);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const html = await r.text();
    for (const t of ['Twoja instalacja', p.numer, 'Zawoja', 'ETNER Instalacje', 'Klimatyzator salon', 'Daikin', 'FTXM35', '10.05.2026', '10.05.2031',
      'Czyszczenie filtrów', 'Wszystko sprawne', '01.10.2026', 'technik ETNER', 'instrukcja-klima.pdf', '20.11.2026',
      'id="klimatyzacja"', 'href="#klimatyzacja"', 'id="alarmy-i-monitoring"', 'href="tel:600100200"']) expect(html).toContain(t);
    expect(html).toContain(`mailto:serwis@example.com?subject=${encodeURIComponent(`Serwis – paszport ${p.numer}`)}`);
    expect(html).not.toContain('TAJNE');
    expect(html).not.toMatch(/Bartek|Technikowski|Adamski/);
    expect(html).not.toContain('<script');
    expect(html.match(/<img /g)?.length).toBe(3); // logo, zdjęcie teczki, zdjęcie z dziennika oznaczone dla klienta
    expect(html).toMatch(/\/api\/files\/[^"]+thumb\.webp\?exp=\d+&amp;sig=/); // podpisane linki
  });

  it('HTML escapuje dane klienta', async () => {
    const s = await setup();
    const p = await call(s, s.worker, 'POST', '/api/passports', { siteId: s.site.id });
    const html = await (await page(s, p.token)).text();
    expect(html).toContain('Jan &lt;script&gt;alert(1)&lt;/script&gt; Nowak');
    expect(html).not.toContain('<script');
  });

  it('unieważniony i losowy token: ta sama strona „nieaktywny” z telefonem firmy (200)', async () => {
    const s = await setup();
    const { p } = await filled(s);
    await call(s, s.admin, 'POST', `/api/passports/${p.id}/link`);
    const old = await page(s, p.token);
    const rnd = await page(s, 'A'.repeat(43));
    const junk = await page(s, '..%2F..%2Fx');
    expect([old.status, rnd.status, junk.status]).toEqual([200, 200, 200]);
    const html = await old.text();
    expect(html).toContain('Ten kod nie jest już aktywny');
    expect(html).toContain('href="tel:600100200"');
    expect(html).not.toContain('Klimatyzator');
    expect(await rnd.text()).toBe(html);
    expect(await junk.text()).toBe(html);
  });

  it('noindex, bez skryptów (CSP), bez cache', async () => {
    const s = await setup();
    const r = await page(s, 'x');
    expect(r.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(r.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    expect(r.headers.get('content-security-policy')).not.toMatch(/script-src/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    // reszta aplikacji z dotychczasowym CSP
    expect((await s.app.request('/api/health')).headers.get('content-security-policy')).toMatch(/script-src 'self'/);
  });

  it('61. zapytanie z jednego IP w minucie → 429; inny IP dalej działa', async () => {
    const s = await setup();
    for (let i = 0; i < 60; i++) expect((await page(s, 'x', '9.9.9.9')).status).toBe(200);
    expect((await page(s, 'x', '9.9.9.9')).status).toBe(429);
    expect((await page(s, 'x', '8.8.8.8')).status).toBe(200);
  });

  it('limit liczy ostatni wpis X-Forwarded-For: zmiana podanego przez klienta nic nie daje; 5000+ fałszywych adresów nie blokuje nowych klientów', async () => {
    const s = await setup();
    for (let i = 0; i < 60; i++) expect((await page(s, 'x', '7.7.7.7', `6.6.${i}.1`)).status).toBe(200);
    expect((await page(s, 'x', '7.7.7.7', '6.6.6.6')).status).toBe(429);
    // napastnik z własnymi adresami w ostatnim wpisie zapełnia mapę – najstarsze okna wypadają, nowy klient przechodzi
    for (let i = 0; i < 5100; i++) await page(s, 'x', `172.16.${i >> 8}.${i & 255}`);
    expect((await page(s, 'x', '5.5.5.5')).status).toBe(200);
  }, 60_000);

  it('usunięte obiekt, klient, teczka, urządzenie, wpis i plik nie trafiają na stronę', async () => {
    const s = await setup();
    const { p } = await filled(s);
    const db = s.deps.db.$client;
    const html0 = await (await page(s, p.token)).text();
    expect(html0).toContain('Klimatyzator salon');
    db.prepare("update devices set deleted_at = 'x' where nazwa = 'Klimatyzator salon'").run();
    db.prepare("update service_entries set deleted_at = 'x' where uwagi = 'Wszystko sprawne'").run();
    db.prepare("update attachments set deleted_at = 'x' where nazwa = 'instrukcja-klima.pdf'").run();
    let html = await (await page(s, p.token)).text();
    for (const t of ['Klimatyzator salon', 'Wszystko sprawne', 'instrukcja-klima.pdf']) expect(html).not.toContain(t);
    db.prepare("update passport_folders set deleted_at = 'x' where kategoria = 'Klimatyzacja'").run();
    expect(await (await page(s, p.token)).text()).not.toContain('id="klimatyzacja"');
    const inactive = await (await page(s, 'A'.repeat(43))).text();
    db.prepare("update clients set deleted_at = 'x'").run();
    expect(await (await page(s, p.token)).text()).toBe(inactive);
    db.prepare("update clients set deleted_at = null").run();
    db.prepare('update sites set deleted_at = ? where id = ?').run('x', s.site.id);
    html = await (await page(s, p.token)).text();
    expect(html).toBe(inactive);
  });
});
