import { addMonths, dayOf } from '@etner/shared';
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
  await page.getByRole('link', { name: 'Paszport → Rekuperacja' }).click();
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
  await page.getByRole('link', { name: 'Paszport → Rekuperacja' }).click();
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

test('dziennik: typ dokumentu i „W paszporcie dla klienta”; pracownik nie widzi faktur ani rozliczenia', async ({ page, browser }, info) => {
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

  // teczka: dokument z dziennika z typem i „dla klienta”; admin dodaje fakturę i notatkę z rozliczeniem
  await page.getByRole('link', { name: 'Paszport → Rekuperacja' }).click();
  const docs = page.getByRole('region', { name: 'Dokumenty' });
  await expect(docs.getByRole('listitem').filter({ hasText: `projekt-${t}.pdf` })).toContainText(/Projekt · Z\d+.*dla klienta/);
  await docs.getByRole('button', { name: 'Plik', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Dodaj plik do teczki' });
  await dlg.locator('input[data-file]').setInputFiles(pdf(`faktura-${t}.pdf`));
  await dlg.getByLabel('Typ dokumentu').click();
  await page.getByRole('option', { name: 'Faktura' }).click();
  await dlg.getByRole('button', { name: /^Dodaj/ }).click();
  await expect(docs.getByRole('listitem').filter({ hasText: `faktura-${t}.pdf` })).not.toContainText('wysyłanie');
  await docs.getByRole('button', { name: /Rozliczenie \(notatka\)/ }).click();
  await page.getByLabel('Notatka z rozliczeniem').fill(`Zaliczka ${t}`);
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(docs).toContainText(`Zaliczka ${t}`);
  const folder = new URL(page.url()).hash;
  // długie nazwy plików nie poszerzają strony (telefon bez przewijania w bok)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // pracownik (ekipa Bartek): teczka bez faktury i bez notatki z rozliczeniem
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${folder}`);
  const wdocs = w.getByRole('region', { name: 'Dokumenty' });
  await expect(wdocs).toContainText(`projekt-${t}.pdf`);
  await expect(wdocs).not.toContainText(`faktura-${t}.pdf`);
  await expect(wdocs).not.toContainText('Rozliczenie');
  await expect(w.getByText(`Zaliczka ${t}`)).toHaveCount(0);
  // pracownik nie wybierze faktury przy dodawaniu pliku
  await wdocs.getByRole('button', { name: 'Plik', exact: true }).click();
  await w.getByRole('dialog', { name: 'Dodaj plik do teczki' }).getByLabel('Typ dokumentu').click();
  await expect(w.getByRole('option', { name: 'Projekt' })).toBeVisible();
  await expect(w.getByRole('option', { name: 'Faktura' })).toHaveCount(0);
  await ctx.close();
});

test('zakładka Paszporty: lista obiektów z teczkami, wyszukiwanie, klik → teczka', async ({ page }, info) => {
  await login(page, 'Tomasz Wrona');
  if (phone(info)) {
    await page.getByRole('link', { name: /Więcej/ }).first().click();
    await page.getByRole('link', { name: /^Paszporty/ }).click();
  } else await page.getByRole('navigation').getByRole('link', { name: 'Paszporty' }).click();
  const lista = page.getByRole('region', { name: 'Paszporty' });
  const row = lista.getByRole('listitem').filter({ has: page.getByText('Józef Bukowski', { exact: true }) });
  await expect(row.getByRole('link', { name: /^Rekuperacja/ })).toBeVisible();
  if (!phone(info)) await expect(page.getByRole('navigation').getByRole('link', { name: 'Paszporty' })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: `${shots}task4b-${phone(info) ? 'phone' : 'desktop'}-paszporty.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('searchbox', { name: 'Szukaj paszportu' }).fill('bukowski rekuperacja');
  await expect(lista.locator(':scope > ul > li')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Szukaj paszportu' }).fill('nie ma takiego obiektu');
  await expect(lista.getByText('Nic nie znaleziono')).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click();
  await row.getByRole('link', { name: /^Rekuperacja/ }).click();
  await expect(page.getByRole('heading', { name: 'Rekuperacja', level: 2 })).toBeVisible();
  if (!phone(info)) await expect(page.getByRole('navigation').getByRole('link', { name: 'Paszporty' })).toHaveAttribute('aria-current', 'page');
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
