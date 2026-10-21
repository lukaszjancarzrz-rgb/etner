import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addDays, dayOf, isWorkday, mondayOf } from '@etner/shared';

const photo = fileURLToPath(new URL('./fixtures/zdjecie.jpg', import.meta.url));

async function loginAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  // zły login, potem konto demo z listy (ekran logowania wypełnia login i hasło)
  await page.getByLabel('Login').fill('tomek');
  await page.getByLabel('Hasło', { exact: true }).fill('zle-haslo');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy login lub hasło.');
  await page.getByRole('button', { name: /Tomasz Wrona/ }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}

/** Obraz faktycznie wczytany (302 → podpisany link → plik). */
const loaded = (page: Page, sel: string) =>
  expect.poll(() => page.locator(sel).first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0).catch(() => false), { timeout: 15_000 }).toBe(true);

test('demo: zlecenie, dziennik ze zdjęciem, harmonogram, zakupy', async ({ page }, info) => {
  const tag = `E2E ${info.project.name}`;
  await loginAdmin(page);

  // Otwarcie zlecenia
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  await loaded(page, 'img[src*="/api/attachments/"][src*="v=thumb"]');

  // Wpis ze zdjęciem z pliku
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(`${tag}: kanały zamknięte`);
  await page.locator('input[data-gallery]').setInputFiles(photo);
  await expect(page.getByRole('list', { name: 'Wybrane pliki' }).getByRole('img', { name: 'zdjecie.jpg' })).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  const entry = page.locator('li[id^="e-"]', { hasText: `${tag}: kanały zamknięte` });
  await expect(entry).toBeVisible();
  await expect(entry).not.toContainText('wysyłanie');
  await expect(entry.locator('img[src*="/api/attachments/"]')).toHaveCount(1);
  await loaded(page, `li[id^="e-"]:has-text("${tag}") img`);

  // Zdjęcie w podglądzie pełnoekranowym
  await entry.getByRole('button', { name: /Zdjęcie/ }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByText(/Zdjęcie 1 z \d+/)).toBeVisible();
  await loaded(page, '[role="dialog"] img[src*="v=view"]');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  // Harmonogram: komórka → szkic → zatwierdzenie → zapisana
  await page.goto('/#harm');
  await page.getByRole('link', { name: 'Następny tydzień' }).click();
  await expect(page.getByText('Następny tydzień', { exact: true })).toBeVisible();
  const who = info.project.name.startsWith('iPhone') ? 'Kamil Zięba' : 'Adam Pająk';
  const cell = page.locator(`[data-cell$="|${who}"]`).first();
  await cell.click();
  await page.getByRole('radio', { name: 'Tekst' }).click();
  await page.getByLabel('Tekst').fill(tag);
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(cell).toContainText(tag);
  await expect(cell).toHaveAttribute('aria-label', /\(szkic\)$/);
  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  const review = page.getByRole('dialog', { name: 'Szkice harmonogramu' });
  await expect(review.getByText(tag)).toBeVisible();
  await review.getByRole('button', { name: 'Zatwierdź i powiadom' }).click();
  await expect(review).toBeHidden();
  await expect(cell).toContainText(tag);
  await expect(cell).not.toHaveAttribute('aria-label', /\(szkic\)$/);
  await page.reload();
  await expect(page.locator(`[data-cell$="|${who}"]`).first()).toContainText(tag);

  // Zakupy: dodanie pozycji
  await page.goto('/#zakupy');
  await page.getByLabel('Co kupić').fill(`${tag} taśma`);
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  const item = page.locator('li[id^="z-"]', { hasText: `${tag} taśma` });
  await expect(item).toBeVisible();
  await expect(item).not.toContainText('wysyłanie');
  await page.reload();
  await expect(page.locator('li[id^="z-"]', { hasText: `${tag} taśma` })).toBeVisible();
});

test('harmonogram: jedno zlecenie dwóm osobom na 3 dni robocze, admin bez wiersza', async ({ page }, info) => {
  const phone = info.project.name.startsWith('iPhone');
  const [a, b] = phone ? ['Bartek Gawlik', 'Piotr Kuchta'] : ['Marek Pilch', 'Adam Pająk'];
  const start = addDays(mondayOf(dayOf(new Date())), 28); // poza 4 tygodniami z danych demo i pierwszym testem
  const work: string[] = [];
  for (let d = start; work.length < 3; d = addDays(d, 1)) if (isWorkday(d, []) === 1) work.push(d);
  await loginAdmin(page);
  await page.goto(`/#harm/${start}`);
  const cellOf = (d: string, who: string) => page.locator(`[data-cell="${d}|${who}"]`);
  await expect(cellOf(start, a)).toBeVisible();
  // admin nie ma kolumny ani „Gdzie jedziesz”
  await expect(page.locator('[data-cell$="|Tomasz Wrona"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Gdzie jedziesz' })).toHaveCount(0);

  await cellOf(start, a).click();
  const ed = page.getByRole('dialog');
  await ed.getByLabel('Zlecenie').click();
  await page.getByPlaceholder('Numer, klient lub miejscowość').fill('Bukowski');
  await page.getByRole('option').first().click();
  const numer = (await ed.getByLabel('Zlecenie').innerText()).split(',')[0]!.trim();
  await ed.getByRole('checkbox', { name: b }).click();
  await expect(ed.getByRole('checkbox', { name: a })).toHaveAttribute('aria-checked', 'true');
  await ed.getByLabel('Do').fill(work[2]!);
  await expect(ed.getByRole('checkbox', { name: 'Tylko dni robocze' })).toHaveAttribute('aria-checked', 'true');
  await ed.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(ed).toBeHidden();
  for (const d of work) for (const w of [a, b]) {
    await expect(cellOf(d, w)).toContainText(numer);
    await expect(cellOf(d, w)).toHaveAttribute('aria-label', /\(szkic\)$/);
  }

  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  const review = page.getByRole('dialog', { name: 'Szkice harmonogramu' });
  await expect(review.getByText(numer).first()).toBeVisible();
  await review.getByRole('button', { name: 'Zatwierdź i powiadom' }).click();
  await expect(review).toBeHidden();
  await page.reload();
  for (const d of work) for (const w of [a, b]) {
    await expect(cellOf(d, w)).toContainText(numer);
    await expect(cellOf(d, w)).not.toHaveAttribute('aria-label', /\(szkic\)$/);
  }
});

test('harmonogram: widok miesiąca na komputerze', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('iPhone'), 'telefon ma tylko tydzień');
  const t = dayOf(new Date());
  const name = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${t.slice(0, 7)}-15T12:00:00Z`));
  await loginAdmin(page);
  await page.getByRole('radio', { name: 'Miesiąc' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const days = Number(addDays(`${addDays(`${t.slice(0, 7)}-28`, 7).slice(0, 7)}-01`, -1).slice(8));
  await expect(page.locator('[data-cell$="|Bartek Gawlik"]')).toHaveCount(days);
  await expect(page.locator(`[data-cell="${t}|Bartek Gawlik"]`)).toBeVisible();
  await page.reload(); // wybór zapamiętany
  await expect(page.getByRole('radio', { name: 'Miesiąc' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('link', { name: 'Następny miesiąc' }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ten miesiąc' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  // komórka miesiąca otwiera ten sam edytor
  await page.locator(`[data-cell="${t}|Bartek Gawlik"]`).click();
  await expect(page.getByRole('dialog', { name: 'Bartek Gawlik' })).toBeVisible();
});

test('klienci: admin zmienia telefon i adres obiektu, zmiana na karcie zlecenia; pracownik bez edycji', async ({ page, browser }, info) => {
  const phone = info.project.name.startsWith('iPhone');
  const [who, tel, adres] = phone ? ['Maria Cholewa', '601 202 303', 'ul. Kościuszki 14'] : ['Stanisław Mrówka', '602 303 404', 'Stryszawa 541'];
  await loginAdmin(page);
  await page.goto('/#kl');
  await page.getByRole('link', { name: new RegExp(who) }).click();
  await expect(page.getByRole('heading', { name: who, level: 2 })).toBeVisible();
  const clientUrl = new URL(page.url()).hash;

  await page.getByRole('button', { name: 'Edytuj klienta' }).click();
  const form = page.getByRole('dialog', { name: 'Edycja klienta' });
  await form.getByLabel('Telefon 1', { exact: true }).fill(tel);
  await form.getByRole('button', { name: 'Dodaj e-mail' }).click();
  await form.getByLabel('E-mail 1', { exact: true }).fill('zly-adres');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form.getByText('Niepoprawny adres e-mail')).toBeVisible();
  await expect(form.getByLabel('Telefon 1', { exact: true })).toHaveValue(tel); // wartości zostają
  await form.getByRole('button', { name: 'Usuń: e-mail 1' }).click();
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('link', { name: tel })).toBeVisible();

  await page.getByRole('button', { name: /^Edytuj obiekt/ }).first().click();
  const sf = page.getByRole('dialog', { name: 'Edycja obiektu' });
  await sf.getByLabel('Adres', { exact: true }).fill(adres);
  await sf.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sf).toBeHidden();
  await expect(page.getByText(adres)).toBeVisible();

  await page.getByRole('link', { name: /Z\d+/ }).first().click();
  await expect(page.getByRole('link', { name: who, exact: true })).toBeVisible();
  await expect(page.getByText(adres).first()).toBeVisible();
  await expect(page.locator(`a[href^="tel:"]`, { hasText: tel })).toBeVisible();
  await page.reload();
  await expect(page.getByText(adres).first()).toBeVisible();

  // pracownik: karta klienta bez „Edytuj”
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${clientUrl}`);
  await expect(w.getByRole('heading', { name: who, level: 2 })).toBeVisible();
  await expect(w.getByRole('link', { name: tel })).toBeVisible();
  await expect(w.getByRole('button', { name: /Edytuj/ })).toHaveCount(0);
  await expect(w.getByRole('button', { name: 'Dodaj obiekt' })).toHaveCount(0);
  await ctx.close();
});
