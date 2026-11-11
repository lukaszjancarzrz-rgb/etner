import { addDays, addMonths, dayOf } from '@etner/shared';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const shots = fileURLToPath(new URL('../../.superpowers/sdd/2026-11-03-etner-modul-2-paszport/shots/', import.meta.url));
const photo = fileURLToPath(new URL('./fixtures/zdjecie.jpg', import.meta.url));
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}
const phone = (info: { project: { name: string } }) => info.project.name.startsWith('iPhone');

/** Z karty zlecenia do teczki: bez paszportu „Paszport” prowadzi na kartę obiektu – tam „Załóż paszport” (wspólna baza: zakłada pierwszy test), potem kafelek teczki. */
async function teczka(page: Page, kat: string) {
  await page.getByRole('link', { name: /^Paszport( →|$)/ }).click();
  const head = page.getByRole('heading', { name: kat, level: 2 });
  const zaloz = page.getByRole('button', { name: 'Załóż paszport' });
  await expect(head.or(zaloz).or(page.getByText(/^PSZ-\d{4}-\d{3}$/))).toBeVisible();
  if (await head.isVisible()) return;
  if (await zaloz.isVisible()) await zaloz.click();
  await page.getByRole('region', { name: 'Teczki' }).getByRole('link', { name: new RegExp(`^${kat}`) }).click();
  await expect(page.getByRole('heading', { name: kat, level: 2 })).toBeVisible();
}

/** Karta zlecenia Józefa Bukowskiego (montaż Rekuperacji); obiekt ma też serwis Rekuperacji. */
async function bukowski(page: Page) {
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
}

test('paszport: klient → teczka Rekuperacja, wpis serwisowy offline z +6 mies., zlecenie → teczka', async ({ page }, info) => {
  const tag = `E2E psz ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await bukowski(page);

  // ze zlecenia: „Paszport → Rekuperacja” otwiera tę teczkę
  if (!phone(info)) await page.screenshot({ path: `${shots}task4-desktop-jobcard.png` });
  await teczka(page, 'Rekuperacja');
  await expect(page.getByRole('heading', { name: 'Rekuperacja', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rekuperacja', exact: true })).toHaveAttribute('aria-current', 'page');
  const folder = new URL(page.url()).hash;

  // z karty klienta: sekcja „Paszport instalacji” z kafelkiem teczki (dwa zlecenia Rekuperacji)
  await page.getByRole('link', { name: 'Józef Bukowski', exact: true }).click();
  const sekcja = page.getByRole('region', { name: /Paszport instalacji/ });
  const tile = sekcja.getByRole('link', { name: /^Rekuperacja/ });
  await expect(tile).toContainText('2 zlecenia');
  await sekcja.scrollIntoViewIfNeeded();
  if (phone(info)) await page.screenshot({ path: `${shots}task4-phone-client.png` });
  await tile.click();
  expect(new URL(page.url()).hash).toBe(folder);
  await expect(page.getByRole('region', { name: 'Karta serwisowa' })).toBeVisible();

  // „+ Wpis” bez zasięgu: dwie czynności, +6 mies.
  await page.context().setOffline(true);
  await page.getByRole('link', { name: 'Wpis', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wpis serwisowy', level: 2 })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Wymiana filtrów F7' }).click();
  await page.getByRole('checkbox', { name: 'Czyszczenie wymiennika' }).click();
  await page.getByLabel('Uwagi').fill(tag);
  await page.getByRole('button', { name: '+6 mies.' }).click();
  await expect(page.getByRole('button', { name: '+6 mies.' })).toHaveAttribute('aria-pressed', 'true');
  const next = addMonths(dayOf(new Date()), 6);
  await expect(page.getByLabel('Data następnego serwisu')).toHaveValue(next);
  await page.screenshot({ path: `${shots}task4-${phone(info) ? 'phone' : 'desktop'}-wpis.png`, fullPage: true });
  await page.getByRole('button', { name: 'Zapisz wpis' }).click();

  const card = page.getByRole('region', { name: 'Karta serwisowa' });
  const row = card.getByRole('row', { name: new RegExp(tag) });
  await expect(row).toContainText('Wymiana filtrów F7, Czyszczenie wymiennika');
  await expect(row).toContainText('wysyłanie');
  await expect(page.getByText(`Następny serwis: ${fmt(next)}`)).toBeVisible();

  // sieć wraca: wpis zapisany (bez „wysyłanie”), zostaje po odświeżeniu
  await page.context().setOffline(false);
  await expect(row).not.toContainText('wysyłanie', { timeout: 20_000 });
  await page.reload();
  await expect(card.getByRole('row', { name: new RegExp(tag) })).toContainText('Wymiana filtrów F7, Czyszczenie wymiennika');
  await expect(page.getByText(`Następny serwis: ${fmt(next)}`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${shots}task4-${phone(info) ? 'phone' : 'desktop'}-folder.png`, fullPage: true });
  // po zapisie „wstecz” wrócił do teczki (bez formularza w historii): następne „wstecz” to karta klienta
  await page.goBack();
  await expect(page.getByRole('region', { name: /Paszport instalacji/ })).toBeVisible();
});

test('teczka: „nowe” przy cudzym wpisie serwisowym (kafelek i karta), po ponownym otwarciu znika', async ({ page, browser }, info) => {
  const tag = `E2E cudzy wpis ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await bukowski(page);
  await teczka(page, 'Rekuperacja');
  await expect(page.getByRole('region', { name: 'Karta serwisowa' })).toBeVisible();
  const folder = new URL(page.url()).hash;
  await page.getByRole('link', { name: 'Józef Bukowski', exact: true }).click(); // wyjście z teczki: obejrzana teraz

  // pracownik dodaje wpis do tej teczki
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${folder}`);
  await w.getByRole('link', { name: 'Wpis', exact: true }).click();
  await w.getByRole('checkbox', { name: 'Wymiana filtrów G4' }).click();
  await w.getByLabel('Uwagi').fill(tag);
  await w.getByRole('button', { name: 'Zapisz wpis' }).click();
  await expect(w.getByRole('region', { name: 'Karta serwisowa' }).getByRole('row', { name: new RegExp(tag) })).not.toContainText('wysyłanie');
  await ctx.close();

  // admin: licznik na kafelku i znacznik przy wpisie; po ponownym otwarciu teczki znika
  const tile = page.getByRole('region', { name: /Paszport instalacji/ }).getByRole('link', { name: /^Rekuperacja/ });
  await expect(tile).toContainText(/\d+ nowe/);
  await tile.click();
  const row = page.getByRole('region', { name: 'Karta serwisowa' }).getByRole('row', { name: new RegExp(tag) });
  await expect(row).toContainText('nowe');
  await page.getByRole('link', { name: 'Józef Bukowski', exact: true }).click();
  await expect(tile).not.toContainText('nowe');
  await tile.click();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('nowe');
});

test('dziennik: typ dokumentu i „W paszporcie dla klienta”; pracownik nie widzi faktur; bez notatki z rozliczeniem (R71)', async ({ page, browser }, info) => {
  const t = `${info.project.name.replace(/\s+/g, '')}-${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await bukowski(page);

  // plik w dzienniku zlecenia: typ „Projekt” i „W paszporcie dla klienta”
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(`Projekt ${t}`);
  await page.locator('input[data-file]').setInputFiles(pdf(`projekt-${t}.pdf`));
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  const entry = page.locator('li[id^="e-"]', { hasText: `Projekt ${t}` });
  await expect(entry).not.toContainText('wysyłanie');
  await entry.getByRole('combobox', { name: `Typ dokumentu: projekt-${t}.pdf` }).click();
  await page.getByRole('option', { name: 'Projekt' }).click();
  const sw = entry.getByRole('switch', { name: 'W paszporcie dla klienta' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.locator('li[id^="e-"]', { hasText: `Projekt ${t}` }).getByRole('switch', { name: 'W paszporcie dla klienta' })).toHaveAttribute('aria-checked', 'true');

  // teczka: dokument z dziennika z typem i „dla klienta”; admin dodaje fakturę
  await teczka(page, 'Rekuperacja');
  const docs = page.getByRole('region', { name: 'Dokumenty' });
  await expect(docs.getByRole('listitem').filter({ hasText: `projekt-${t}.pdf` })).toContainText(/Projekt · Z\d+.*dla klienta/);
  await docs.getByRole('button', { name: 'Plik', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Dodaj plik do teczki' });
  await dlg.locator('input[data-file]').setInputFiles(pdf(`faktura-${t}.pdf`));
  // dodane w teczce: domyślnie w paszporcie dla klienta; faktura zawsze wewnętrzna (bez przełącznika)
  await expect(dlg.getByRole('checkbox', { name: 'W paszporcie dla klienta' })).toBeChecked();
  await dlg.getByLabel('Typ dokumentu').click();
  await page.getByRole('option', { name: 'Faktura' }).click();
  await expect(dlg.getByRole('checkbox', { name: 'W paszporcie dla klienta' })).toHaveCount(0);
  await dlg.getByRole('button', { name: /^Dodaj/ }).click();
  await expect(docs.getByRole('listitem').filter({ hasText: `faktura-${t}.pdf` })).not.toContainText('wysyłanie');
  await expect(docs.getByRole('listitem').filter({ hasText: `faktura-${t}.pdf` })).not.toContainText('dla klienta');
  // zdjęcia osobno: „+ Zdjęcie” w Zdjęciach (aparat / galeria), „+ Plik” w Dokumentach bez aparatu
  await docs.getByRole('button', { name: 'Plik', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj plik do teczki' }).getByRole('button', { name: 'Aparat' })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Dodaj plik do teczki' }).getByRole('button', { name: 'Anuluj' }).click();
  const zdj = page.getByRole('region', { name: 'Zdjęcia' });
  const before = await zdj.getByRole('listitem').count();
  await zdj.getByRole('button', { name: 'Zdjęcie', exact: true }).click();
  const pdlg = page.getByRole('dialog', { name: 'Dodaj zdjęcia do teczki' });
  await expect(pdlg.getByRole('checkbox', { name: 'W paszporcie dla klienta' })).toBeChecked();
  await expect(pdlg.getByLabel('Typ dokumentu')).toHaveCount(0);
  await pdlg.locator('input[data-gallery]').setInputFiles([photo, photo]);
  await pdlg.getByRole('button', { name: /^Dodaj/ }).click();
  await expect(zdj.getByRole('listitem')).toHaveCount(before + 2);
  await expect(docs).not.toContainText('zdjecie.jpg');
  // R71: bez notatki z rozliczeniem (dokumenty i ustawienia teczki)
  await expect(docs).not.toContainText('Rozliczenie');
  const folder = new URL(page.url()).hash;
  // długie nazwy plików nie poszerzają strony (telefon bez przewijania w bok)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // pracownik (ekipa Bartek): teczka bez faktury
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${folder}`);
  const wdocs = w.getByRole('region', { name: 'Dokumenty' });
  await expect(wdocs).toContainText(`projekt-${t}.pdf`);
  await expect(wdocs).not.toContainText(`faktura-${t}.pdf`);
  // pracownik nie wybierze faktury przy dodawaniu pliku
  await wdocs.getByRole('button', { name: 'Plik', exact: true }).click();
  await w.getByRole('dialog', { name: 'Dodaj plik do teczki' }).getByLabel('Typ dokumentu').click();
  await expect(w.getByRole('option', { name: 'Projekt' })).toBeVisible();
  await expect(w.getByRole('option', { name: 'Faktura' })).toHaveCount(0);
  await ctx.close();
});

test('zakładka Paszporty: lista obiektów z teczkami, wyszukiwanie, klik → teczka', async ({ page }, info) => {
  await login(page, 'Tomasz Wrona');
  await page.getByRole('link', { name: /Więcej/ }).first().click(); // Paszporty w Więcej (telefon i komputer)
  await page.getByRole('main').getByRole('link', { name: /^Paszporty/ }).click();
  const lista = page.getByRole('region', { name: 'Paszporty' });
  const row = lista.locator('li, tr').filter({ has: page.getByText('Józef Bukowski', { exact: true }) });
  await expect(row.getByRole('link', { name: /^Rekuperacja/ })).toBeVisible();
  if (!phone(info)) await expect(page.getByRole('navigation').getByRole('link', { name: /^Więcej/ })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: `${shots}task4b-${phone(info) ? 'phone' : 'desktop'}-paszporty.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('searchbox', { name: 'Szukaj paszportu' }).fill('bukowski rekuperacja');
  await expect(lista.locator(':scope > ul > li, :scope > table > tbody > tr')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Szukaj paszportu' }).fill('nie ma takiego obiektu');
  await expect(lista.getByText('Nic nie znaleziono')).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click();
  await row.getByRole('link', { name: /^Rekuperacja/ }).click();
  await expect(page.getByRole('heading', { name: 'Rekuperacja', level: 2 })).toBeVisible();
  if (!phone(info)) await expect(page.getByRole('navigation').getByRole('link', { name: /^Więcej/ })).toHaveAttribute('aria-current', 'page');
});

test('dziennik: „W paszporcie dla klienta” na miniaturach zdjęć (admin), bez podglądu, także offline', async ({ page }, info) => {
  const tag = `Miniatury ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await bukowski(page);
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(tag);
  await page.locator('input[data-gallery]').setInputFiles([photo, photo]);
  await page.locator('input[data-file]').setInputFiles(pdf(`plan-${Date.now() % 100000}.pdf`));
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  const entry = page.locator('li[id^="e-"]', { hasText: tag });
  await expect(entry).not.toContainText('wysyłanie');
  const sws = entry.getByRole('switch', { name: /^W paszporcie dla klienta: zdjecie/ });
  await expect(sws).toHaveCount(2);
  await expect(sws.first()).toHaveAttribute('aria-checked', 'false');
  // plik: przełącznik w wierszu jak dotąd
  await expect(entry.getByRole('switch', { name: 'W paszporcie dla klienta', exact: true })).toBeVisible();

  // bez zasięgu: przełączenie od razu na miniaturze, zapis w kolejce
  await page.context().setOffline(true);
  await sws.first().click();
  await expect(sws.first()).toHaveAttribute('aria-checked', 'true');
  await expect(sws.nth(1)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTitle('Zapisy czekające na wysłanie')).toBeVisible();
  await entry.scrollIntoViewIfNeeded();
  if (!phone(info)) await entry.screenshot({ path: `${shots}task4b-desktop-diary-toggles.png` });
  else await entry.screenshot({ path: `${shots}task4b-phone-diary-toggles.png` });
  await page.context().setOffline(false);
  await expect(page.getByTitle('Zapisy czekające na wysłanie')).toBeHidden({ timeout: 20_000 });
  await page.reload();
  const again = page.locator('li[id^="e-"]', { hasText: tag }).getByRole('switch', { name: /^W paszporcie dla klienta: zdjecie/ });
  await expect(again.first()).toHaveAttribute('aria-checked', 'true');
  // podgląd pokazuje ten sam stan
  await page.locator('li[id^="e-"]', { hasText: tag }).getByRole('button', { name: /Zdjęcie/ }).first().click();
  await expect(page.getByRole('dialog').getByRole('switch', { name: 'W paszporcie dla klienta' })).toHaveAttribute('aria-checked', 'true');
});

test('teczka: „Wróć” wraca tam, skąd przyszliśmy (lista → karta obiektu → teczka; zlecenie → teczka)', async ({ page }) => {
  await login(page, 'Tomasz Wrona');
  await bukowski(page);
  await teczka(page, 'Rekuperacja'); // paszport założony (jeśli go nie było)
  await page.goto('/#paszporty');
  const lista = page.getByRole('region', { name: 'Paszporty' });
  await lista.getByRole('link', { name: /^Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  const siteHash = new URL(page.url()).hash;
  await page.getByRole('region', { name: 'Teczki' }).getByRole('link', { name: /^Rekuperacja/ }).click();
  await expect(page.getByRole('heading', { name: 'Rekuperacja', level: 2 })).toBeVisible();
  // przełączenie teczki nie dokłada kroku „Wróć”
  const inna = page.getByRole('navigation', { name: 'Teczki obiektu' }).getByRole('link').filter({ hasNotText: 'Rekuperacja' }).first();
  if (await inna.count()) await inna.click();
  await page.getByRole('link', { name: 'Wróć' }).click();
  expect(new URL(page.url()).hash).toBe(siteHash);
  await page.getByRole('link', { name: 'Wróć' }).click();
  await expect(page).toHaveURL(/#paszporty$/);

  // ze zlecenia: teczka → „Wróć” → to samo zlecenie
  await bukowski(page);
  const job = new URL(page.url()).hash;
  await page.getByRole('link', { name: 'Paszport → Rekuperacja' }).click();
  await expect(page.getByRole('heading', { name: 'Rekuperacja', level: 2 })).toBeVisible();
  await page.getByRole('link', { name: 'Wróć' }).click();
  expect(new URL(page.url()).hash).toBe(job);
});

test('karta paszportu: „Załóż paszport” → PSZ, naklejka (PNG 240×400, pionowo), link z naklejki → strona klienta, nowy link', async ({ page, browser }, info) => {
  await login(page, 'Tomasz Wrona');
  // dane firmy na naklejkę (Ustawienia, admin)
  await page.goto('/#ust');
  const firma = page.getByRole('region', { name: 'Dane firmy' });
  await expect(firma.getByLabel('Nazwa')).toHaveValue(/.+/);
  await firma.getByLabel('Telefon serwisu').fill('600 000 000');
  await firma.getByLabel('Strona www').fill('etner.example');
  await firma.getByLabel('E-mail').fill('zle@');
  await firma.getByRole('button', { name: 'Zapisz dane firmy' }).click();
  await expect(firma.getByText('Wpisz poprawny adres e-mail')).toBeVisible();
  await firma.getByLabel('E-mail').fill('serwis@etner.example');
  await firma.getByRole('button', { name: 'Zapisz dane firmy' }).click();
  await expect(page.getByText('Zapisano dane firmy', { exact: true })).toBeVisible();

  await page.goto('/#paszporty');
  // wiersz obiektu (nagłówek) → karta paszportu obiektu
  await page.getByRole('region', { name: 'Paszporty' }).getByRole('link', { name: /^Józef Bukowski/ }).click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  const site = new URL(page.url()).hash;
  // wspólna baza obu projektów: paszport zakłada pierwszy
  const zaloz = page.getByRole('button', { name: 'Załóż paszport' });
  if (await zaloz.isVisible()) await zaloz.click();
  const numer = page.getByText(/^PSZ-\d{4}-\d{3}$/);
  await expect(numer).toBeVisible();
  const psz = (await numer.textContent())!;
  await expect(page.getByRole('region', { name: 'Teczki' }).getByRole('link', { name: /^Rekuperacja/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Karta klienta' })).toBeVisible();

  const qr = page.getByRole('region', { name: 'Kod QR i naklejka' });
  await expect(qr.getByRole('img', { name: `Podgląd naklejki ${psz}` })).toBeVisible();
  await expect(qr.getByRole('radio', { name: '50×30 mm' })).toHaveAttribute('aria-checked', 'true');
  if (!phone(info)) {
    await page.screenshot({ path: `${shots}task7-desktop-site-card.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${shots}task7-phone-site-card.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // „Pobierz obraz”: PNG rolki 50×30 mm przy 203 dpi, projekt pionowy (obrót o 90°)
  const [dl] = await Promise.all([page.waitForEvent('download'), qr.getByRole('button', { name: 'Pobierz obraz' }).click()]);
  expect(dl.suggestedFilename()).toBe(`naklejka-${psz}.png`);
  const png = Buffer.concat(await (async () => { const out: Buffer[] = []; for await (const c of (await dl.createReadStream())) out.push(c as Buffer); return out; })());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([240, 400]);

  // link z naklejki = „Podgląd klienta” → strona klienta
  const url = (await qr.getByTitle(/\/p\//).getAttribute('title'))!;
  expect(await page.getByRole('link', { name: /Podgląd klienta/ }).getAttribute('href')).toBe(new URL(url).pathname);
  const client = await page.context().newPage();
  await client.goto(url);
  await expect(client.getByRole('heading', { name: 'Józef Bukowski', level: 1 })).toBeVisible();
  await expect(client.getByText(psz, { exact: true })).toBeVisible();

  // pracownik: karta obiektu i naklejka, bez „Unieważnij link”
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${site}`);
  await expect(w.getByRole('region', { name: 'Kod QR i naklejka' }).getByRole('img', { name: `Podgląd naklejki ${psz}` })).toBeVisible();
  await expect(w.getByRole('button', { name: 'Unieważnij link i utwórz nowy' })).toHaveCount(0);
  await ctx.close();

  // admin: nowy link po potwierdzeniu; stary przestaje działać
  await page.reload();
  await qr.getByRole('button', { name: 'Unieważnij link i utwórz nowy' }).click();
  await page.getByRole('dialog', { name: 'Unieważnić link?' }).getByRole('button', { name: 'Unieważnij i utwórz nowy' }).click();
  await expect(qr.getByTitle(/\/p\//)).not.toHaveAttribute('title', url);
  await client.goto(url);
  await expect(client.getByRole('heading', { name: 'Ten kod nie jest już aktywny' })).toBeVisible();
  await client.goto((await qr.getByTitle(/\/p\//).getAttribute('title'))!);
  await expect(client.getByRole('heading', { name: 'Józef Bukowski', level: 1 })).toBeVisible();
});

test('Do serwisu: teczka z terminem w 30 dni na liście i w liczniku menu, „Przesuń termin”, „Zrób zlecenie serwisowe” → karta zlecenia; pracownik bez dostępu', async ({ page, browser }, info) => {
  await login(page, 'Tomasz Wrona');
  // teczka Klimatyzacja Wojciecha Kolasy (paszport zakładany w teście): termin za 10 dni
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Wojciech Kolasa/ }).first().click();
  await teczka(page, 'Klimatyzacja');
  const today = dayOf(new Date()), soon = addDays(today, 10), later = addDays(today, 20);
  await page.getByRole('button', { name: 'Zmień' }).click();
  await page.getByRole('dialog').getByLabel('Następny serwis').fill(soon);
  await page.getByRole('dialog').getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText(`Następny serwis: ${fmt(soon)}`)).toBeVisible();

  // licznik: menu boczne (komputer) albo kafelek w Więcej (telefon)
  if (phone(info)) await page.goto('/#wiecej');
  const nav = phone(info) ? page.getByRole('main') : page.getByRole('navigation');
  await nav.getByRole('link', { name: /^Do serwisu.*\d+ tecz\w+ do serwisu/ }).click();
  await expect(page.getByRole('heading', { name: 'Do serwisu', level: 1 })).toBeVisible();
  const row = page.locator('[aria-label="W ciągu 30 dni"]').locator('li, tr').filter({ hasText: 'Wojciech Kolasa' });
  await expect(row).toContainText(fmt(soon));
  await expect(row).toContainText('następny serwis za 10 dni');
  await expect(row).toContainText('klient bez e-maila');
  await expect(row.getByRole('link', { name: 'Teczka: Klimatyzacja' })).toHaveAttribute('href', /^#psz\/[^/]+\/Klimatyzacja$/);
  await expect(row.getByRole('link', { name: /^Zadzwoń/ })).toHaveAttribute('href', /^tel:\d+$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}task8-${phone(info) ? 'phone' : 'desktop'}-do-serwisu.png`, scale: 'css' });

  // „Przesuń termin”: ten sam formularz co w teczce
  await row.getByRole('button', { name: 'Przesuń termin' }).click();
  await page.getByRole('dialog').getByLabel('Następny serwis').fill(later);
  await page.getByRole('dialog').getByRole('button', { name: 'Zapisz' }).click();
  await expect(row).toContainText(fmt(later));
  await expect(row).toContainText('następny serwis za 20 dni');

  // dane demo mają otwarte zlecenie serwisowe tej teczki: zamiast przycisku link „Zlecenie Z…” → karta zlecenia (plakietka Serwis)
  await expect(row.getByRole('button', { name: 'Zrób zlecenie serwisowe' })).toHaveCount(0);
  await row.getByRole('link', { name: /^Zlecenie Z\d+$/ }).click();
  await expect(page).toHaveURL(/#zl\/[0-9A-Z]{26}$/);
  await expect(page.getByRole('article').getByText('Serwis', { exact: true })).toBeVisible();
  // zamykamy to zlecenie (API z sesji strony), wtedy teczka znów dostaje przycisk
  const oldId = page.url().split('#zl/')[1]!;
  expect((await page.evaluate(async (id) => (await fetch(`/api/jobs/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'Rozliczone' }) })).status, oldId))).toBe(200);
  await page.goto('/#serwis');
  // „Zrób zlecenie serwisowe” → karta nowego zlecenia (serwis, Klimatyzacja, miesiąc terminu)
  await row.getByRole('button', { name: 'Zrób zlecenie serwisowe' }).click();
  await expect(page).toHaveURL(/#zl\/[0-9A-Z]{26}$/);
  expect(page.url().split('#zl/')[1]).not.toBe(oldId);
  await expect(page.getByRole('heading', { name: 'Wojciech Kolasa', level: 2 })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('serwis');
  await expect(page.getByRole('link', { name: 'Paszport → Klimatyzacja' })).toBeVisible();
  // po powrocie do „Do serwisu” zamiast przycisku jest link do nowego zlecenia
  await page.goto('/#serwis');
  await expect(row.getByRole('link', { name: /^Zlecenie Z\d+$/ })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Zrób zlecenie serwisowe' })).toHaveCount(0);

  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await login(w, 'Bartek Gawlik');
  await expect(w.getByRole('link', { name: /Do serwisu/ })).toHaveCount(0);
  await w.goto('/#serwis');
  await expect(w.getByRole('heading', { name: 'Brak dostępu', level: 1 })).toBeVisible();
  await ctx.close();
});
