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

/** Edytor komórki: komórka ze zleceniem ma przycisk ✎ (samo zlecenie prowadzi do karty), pozostałe otwiera kliknięcie. */
async function editCell(cell: ReturnType<Page['locator']>) {
  const pen = cell.getByRole('button', { name: /^Edytuj komórkę/ });
  if (await pen.count()) await pen.click(); else await cell.click();
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
  await editCell(cell);
  await page.getByRole('radio', { name: 'Tekst' }).click();
  await page.getByLabel('Tekst').fill(tag);
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(cell).toContainText(tag);
  await expect(cell).toHaveAttribute('aria-label', /, szkic$/);
  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  const review = page.getByRole('dialog', { name: 'Szkice harmonogramu' });
  await expect(review.getByText(tag)).toBeVisible();
  await review.getByRole('button', { name: 'Zatwierdź i powiadom' }).click();
  await expect(review).toBeHidden();
  await expect(cell).toContainText(tag);
  await expect(cell).not.toHaveAttribute('aria-label', /, szkic$/);
  await page.reload();
  await expect(page.locator(`[data-cell$="|${who}"]`).first()).toContainText(tag);

  // Zakupy: dodanie pozycji
  await page.goto('/#zakupy');
  const form = page.locator('form', { has: page.getByLabel('Co kupić') });
  await expect(form.getByLabel('Sklep')).toHaveCount(0);
  await expect(form.getByLabel('Grupa')).toHaveCount(0);
  await expect(form.getByPlaceholder(/kwota/)).toHaveCount(0);
  await page.getByLabel('Co kupić').fill(`${tag} taśma`);
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  const item = page.locator('li[id^="z-"]', { hasText: `${tag} taśma` });
  await expect(item).toBeVisible();
  await expect(item).not.toContainText('wysyłanie');
  await page.reload();
  await expect(page.locator('li[id^="z-"]', { hasText: `${tag} taśma` })).toBeVisible();

  // Admin: ptaszek przenosi pozycję do „Kupione”
  await expect(page.getByRole('combobox', { name: /^Status:/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: `Kupione: ${tag} taśma` }).click();
  await expect(page.locator('li[id^="z-"]', { hasText: `${tag} taśma` })).toBeHidden(); // Kupione zwinięte
  await page.getByRole('button', { name: /^Kupione/ }).click();
  await expect(page.getByRole('checkbox', { name: `Kupione: ${tag} taśma` })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.getByRole('button', { name: /^Kupione/ }).click();
  await expect(page.getByRole('checkbox', { name: `Kupione: ${tag} taśma` })).toHaveAttribute('aria-checked', 'true');
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

  await editCell(cellOf(start, a));
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
    await expect(cellOf(d, w)).toHaveAttribute('aria-label', /, szkic$/);
  }

  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  const review = page.getByRole('dialog', { name: 'Szkice harmonogramu' });
  await expect(review.getByText('Bukowski').first()).toBeVisible();
  await review.getByRole('button', { name: 'Zatwierdź i powiadom' }).click();
  await expect(review).toBeHidden();
  await page.reload();
  for (const d of work) for (const w of [a, b]) {
    await expect(cellOf(d, w)).toContainText(numer);
    await expect(cellOf(d, w)).not.toHaveAttribute('aria-label', /, szkic$/);
  }
  // zlecenie w komórce prowadzi do karty zlecenia
  await cellOf(work[0]!, a).getByRole('link', { name: new RegExp(`^Zlecenie ${numer} .*Józef Bukowski`) }).click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
});

test('harmonogram: strzałki w miejscu, „Dziś” wraca do bieżącego tygodnia i przewija do dziś', async ({ page }) => {
  const t = dayOf(new Date());
  await loginAdmin(page);
  await expect(page.getByText('Ten tydzień', { exact: true })).toBeVisible();
  const next = page.getByRole('link', { name: 'Następny tydzień' });
  const before = await next.boundingBox();
  await next.click();
  await page.getByRole('link', { name: 'Następny tydzień' }).click();
  await expect(page).toHaveURL(new RegExp(`#harm/${addDays(mondayOf(t), 14)}$`));
  const dzis = page.getByRole('link', { name: 'Dziś', exact: true });
  await expect(dzis).toBeVisible();
  expect(await page.getByRole('link', { name: 'Następny tydzień' }).boundingBox()).toEqual(before); // strzałki nie skaczą
  await page.mouse.wheel(0, 2000);
  await dzis.click();
  await expect(page.getByText('Ten tydzień', { exact: true })).toBeVisible();
  await expect(page.locator(`[data-day="${t}"]`)).toBeInViewport();
  // w bieżącym tygodniu „Dziś” też jest: przewija do dzisiejszego dnia i daje mu fokus
  await page.mouse.wheel(0, 2000);
  await page.getByRole('link', { name: 'Dziś', exact: true }).click();
  await expect(page).toHaveURL(/#harm$/);
  await expect(page.locator(`[data-day="${t}"]`)).toBeInViewport();
  await expect(page.locator(`[data-day="${t}"]`)).toBeFocused();
});

test('harmonogram: zmieniony dzień ma „nowe”, licznik spada po obejrzeniu dnia', async ({ page, browser }, info) => {
  const phone = info.project.name.startsWith('iPhone');
  const base = addDays(mondayOf(dayOf(new Date())), phone ? 35 : 49); // tygodnie bez danych demo, inne dla każdego projektu
  const [d1, d2] = [addDays(base, 2), addDays(base, 9)];
  // pracownik loguje się pierwszy (baza „widziane”)
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await expect(w.getByRole('link', { name: /^Harmonogram, \d+ nowe$/ })).toHaveCount(0);

  await loginAdmin(page);
  for (const d of [d1, d2]) {
    await page.goto(`/#harm/${d}`);
    await editCell(page.locator(`[data-cell="${d}|Bartek Gawlik"]`));
    await page.getByRole('radio', { name: 'Tekst' }).click();
    await page.getByLabel('Tekst').fill(`Magazyn ${d}`);
    await page.getByRole('button', { name: 'Zapisz szkic' }).click();
    await expect(page.locator(`[data-cell="${d}|Bartek Gawlik"]`)).toHaveAttribute('aria-label', /, szkic$/);
  }
  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  const review = page.getByRole('dialog', { name: 'Szkice harmonogramu' });
  await review.getByRole('button', { name: 'Zatwierdź i powiadom' }).click();
  await expect(review).toBeHidden();

  // bieżący tydzień: dni zmian nie widać, licznik 2
  await expect(w.getByRole('link', { name: 'Harmonogram, 2 nowe' })).toBeVisible();
  await w.goto(`/#harm/${d1}`);
  const day = w.locator(`[data-day="${d1}"]`);
  await expect(day.getByText('nowe', { exact: true })).toBeVisible();
  await day.scrollIntoViewIfNeeded();
  // dzień był widoczny >1 s, ale „nowe” zostaje, dopóki jesteśmy na ekranie
  await w.waitForTimeout(2500);
  await expect(day.getByText('nowe', { exact: true })).toBeVisible();
  await expect(w.getByRole('link', { name: 'Harmonogram, 2 nowe' })).toBeVisible();
  // wyjście na inny ekran zapisuje obejrzenie
  await w.goto('/#zl');
  await expect(w.getByRole('link', { name: 'Harmonogram, 1 nowe' })).toBeVisible();
  await w.goto(`/#harm/${d1}`);
  await expect(day).toBeVisible();
  await expect(day.getByText('nowe', { exact: true })).toHaveCount(0);
  await w.reload(); // obejrzenie zapamiętane
  await expect(w.getByRole('link', { name: 'Harmonogram, 1 nowe' })).toBeVisible();
  // dotknięcie zmienionego dnia zapisuje od razu
  await w.goto(`/#harm/${d2}`);
  const day2 = w.locator(`[data-day="${d2}"]`);
  await expect(day2.getByText('nowe', { exact: true })).toBeVisible();
  await w.locator(`[data-cell="${d2}|Bartek Gawlik"]`).click();
  await expect(day2.getByText('nowe', { exact: true })).toHaveCount(0);
  await expect(w.getByRole('link', { name: /^Harmonogram, \d+ nowe$/ })).toHaveCount(0);
  await ctx.close();
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
  // te same karty co w tygodniu; strzałki przewijają o tydzień
  const box = page.locator('[data-cell]').first().locator('xpath=ancestor::div[contains(@class,"overflow-auto")]');
  await expect(page.locator(`[data-day="${t}"]`)).toBeInViewport(); // na start widać dziś
  await box.evaluate((e) => { e.scrollLeft = 0; });
  await page.getByRole('button', { name: 'Przewiń tydzień naprzód' }).click();
  await expect.poll(() => box.evaluate((e) => e.scrollLeft)).toBeGreaterThan(1000);
  await expect(page.locator('[data-cell] a[href^="#zl/"]').first()).toBeVisible();
  // komórka miesiąca otwiera ten sam edytor
  await editCell(page.locator(`[data-cell="${t}|Bartek Gawlik"]`));
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

test('zakres prac: admin dodaje punkt ze zdjęciem, pracownik go widzi bez edycji', async ({ page, browser }, info) => {
  const tekst = `E2E ${info.project.name}: kratki w kuchni`;
  await loginAdmin(page);
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  const scope = page.getByRole('region', { name: 'Zakres prac' });
  await expect(scope.getByRole('listitem').first()).toBeVisible();
  await scope.getByRole('button', { name: 'Dodaj punkt' }).click();
  const form = page.getByRole('dialog', { name: 'Nowy punkt zakresu' });
  await form.getByLabel('Co do zrobienia').fill(tekst);
  await form.locator('input[data-gallery]').setInputFiles(photo);
  await expect(form.getByRole('img', { name: 'zdjecie.jpg' })).toBeVisible();
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toBeHidden();
  const item = scope.locator('ol > li', { hasText: tekst });
  await expect(item).not.toContainText('wysyłanie');
  await expect(item.locator('img[src*="/api/attachments/"]')).toHaveCount(1);
  const jobUrl = new URL(page.url()).hash;
  await page.reload();
  const again = page.getByRole('region', { name: 'Zakres prac' }).locator('ol > li', { hasText: tekst });
  await expect(again.locator('img[src*="/api/attachments/"]')).toHaveCount(1);
  await loaded(page, `[aria-label="Zakres prac"] li:has-text("${tekst}") img`);

  // edycja: usunięcie zdjęcia z punktu
  await again.getByRole('button', { name: 'Edytuj' }).click();
  const ed = page.getByRole('dialog', { name: 'Punkt zakresu prac' });
  await ed.getByRole('button', { name: 'Usuń zdjęcie 1' }).click();
  await ed.getByRole('button', { name: 'Zapisz' }).click();
  await expect(ed).toBeHidden();
  await expect(again.locator('img')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Zakres prac' }).locator('ol > li', { hasText: tekst })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Zakres prac' }).locator('ol > li', { hasText: tekst }).locator('img')).toHaveCount(0);

  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(w.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  await w.goto(`/${jobUrl}`);
  const ws = w.getByRole('region', { name: 'Zakres prac' });
  await expect(ws.locator('ol > li', { hasText: tekst })).toBeVisible();
  await expect(ws.getByRole('button', { name: /Dodaj punkt|Edytuj|Przesuń/ })).toHaveCount(0);
  await ctx.close();
});

test('licznik „Na jutro” w menu pokazuje niezabrane rzeczy pracownika', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bartek Gawlik/ }).click();
  await expect(page.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
  // demo: ekipa Bartka ma 2 rzeczy na dziś (jedna zabrana) i 2 na jutro; licznik liczy tylko jutro
  await expect(page.getByRole('link', { name: 'Na jutro, 2 nowe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zakupy', exact: true })).toBeVisible(); // pracownik: bez licznika zakupów
});

test('admin: Na jutro poza głównym menu (koniec menu bocznego / kafelek w Więcej), adres #jutro działa', async ({ page }, info) => {
  const phone = info.project.name.startsWith('iPhone');
  await loginAdmin(page);
  const nav = page.getByRole('navigation', { name: 'Menu' }).filter({ visible: true });
  if (phone) {
    await expect(nav.getByRole('link', { name: /^Na jutro/ })).toHaveCount(0);
    await expect(nav.getByRole('listitem')).toHaveCount(4);
    await nav.getByRole('link', { name: /^Więcej/ }).click();
    await page.getByRole('link', { name: /^Na jutro/ }).click();
  } else {
    await expect(nav.getByRole('listitem').last().getByRole('link')).toHaveText(/^Na jutro/);
    await nav.getByRole('link', { name: /^Na jutro/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Na jutro', level: 1 })).toBeVisible();
  if (phone) await expect(nav.getByRole('link', { name: /^Więcej/ })).toHaveAttribute('aria-current', 'page');
});

test('Pumble (atrapa): sekcja na karcie zlecenia, wysłanie dodaje wiadomość', async ({ page }, info) => {
  await loginAdmin(page);
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  const sec = page.getByRole('region', { name: 'Pumble' });
  await expect(sec.getByText('Materiał na miejscu, zaczynamy jutro o 7:00.')).toBeVisible();
  await expect(sec.getByText('Tomasz Wrona', { exact: true }).first()).toBeVisible(); // prefiks bota jako autor
  await expect(sec.getByText('Bartek Gawlik wrzucił plik')).toBeVisible();
  await expect(sec.getByText('Bartek Gawlik wrzucił 2 zdjęcia')).toBeVisible();
  await expect(sec.getByRole('link', { name: 'Przejdź do Pumble' })).toHaveAttribute('href', /^https:\/\/app\.pumble\.com\/workspace\/ws-demo\//);
  const text = `E2E ${info.project.name}: wjeżdżamy o 8`;
  await sec.getByPlaceholder('Napisz do kanału…').fill(text);
  await sec.getByPlaceholder('Napisz do kanału…').press('Enter');
  await expect(sec.locator('p', { hasText: text })).toBeVisible(); // nie pole tekstowe, które jeszcze nie zdążyło się wyczyścić
  await expect(sec.getByPlaceholder('Napisz do kanału…')).toHaveValue('');
});

test('harmonogram: link z powiadomienia `#harm/<dzień>~<osoba>` otwiera tamten tydzień i podświetla komórkę', async ({ page }) => {
  await loginAdmin(page);
  const people = (await (await page.request.get('/api/schedule-people')).json()) as { id: string; nazwa: string }[];
  const p = people[1]!;
  let day = addDays(mondayOf(dayOf(new Date())), 16); // środa za dwa tygodnie; święto (np. 11.11) na telefonie nie ma komórek
  while (isWorkday(day, []) !== 1) day = addDays(day, 1);
  await page.goto(`/#harm/${day}~${p.id}`);
  const cell = page.locator(`[data-key="${day}|${p.id}"]`);
  await expect(cell).toHaveAttribute('data-flash', 'true');
  await expect(cell).toBeInViewport();
  await expect(page.locator(`[data-day="${mondayOf(day)}"]`)).toHaveCount(1); // poniedziałek tamtego tygodnia
  await expect(cell).not.toHaveAttribute('data-flash', 'true', { timeout: 5000 });
});
