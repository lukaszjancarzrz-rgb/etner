import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string, heading: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

test('czasomierz: pracownik Start/Stop, wpis w „Moje godziny”, admin widzi go w Wpisach', async ({ page, browser }, info) => {
  await login(page, 'Bartek Gawlik', 'Gdzie jedziesz');
  await page.goto('/#czas');
  await expect(page.getByRole('heading', { name: 'Czasomierz', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /START/ }).click();
  await expect(page.getByText(/Pracujesz od/)).toBeVisible();
  await page.getByRole('button', { name: /STOP/ }).click();
  await expect(page.getByRole('heading', { name: 'Zakończyć pracę?' })).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz i zakończ' }).click();
  await expect(page.getByRole('button', { name: /START/ })).toBeVisible();
  const moje = page.getByLabel('Moje godziny');
  await expect(moje.getByText(/\d+ min|\d+ h/).first()).toBeVisible();
  await expect(moje.getByRole('button').filter({ hasText: /\d+:\d\d – \d+:\d\d/ }).first()).toBeVisible();

  // admin (osobny kontekst): Czasomierz → Wpisy
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const a = await ctx.newPage();
  await login(a, 'Tomasz Wrona', 'Harmonogram');
  await a.goto('/#czas');
  const phone = info.project.name.startsWith('iPhone');
  await expect(a.getByText(/zakończył dziś/).first()).toBeVisible(); // Teraz: kto dziś skończył, też widać
  if (phone) { await a.getByLabel('Widok').click(); await a.getByRole('option', { name: 'Wpisy' }).click(); }
  else await a.getByRole('radio', { name: 'Wpisy' }).click();
  await expect(a.getByText('Bartek').first()).toBeVisible();
  // ołówek otwiera edycję wpisu
  await a.getByRole('button', { name: /^Edytuj wpis/ }).first().click();
  await expect(a.getByRole('dialog')).toBeVisible();
  await a.keyboard.press('Escape');
  // zakładka zostaje po wyjściu z ekranu i powrocie (np. karta zlecenia → Wróć)
  await a.goto('/#zl');
  await a.goto('/#czas');
  await expect(a.getByRole('button', { name: /^Edytuj wpis/ }).first()).toBeVisible();
  // Sumy: pierwszy wiersz nie jest zasłonięty przyklejonym nagłówkiem (telefon: tabela przewijana w bok)
  if (phone) { await a.getByLabel('Widok').click(); await a.getByRole('option', { name: 'Sumy' }).click(); }
  else await a.getByRole('radio', { name: 'Sumy' }).click();
  const cell = a.getByRole('table', { name: 'Sumy tygodnia' }).locator('tbody tr').first().locator('td').first();
  const box = (await cell.boundingBox())!;
  expect(await a.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('td,th')?.tagName, [box.x + 5, box.y + box.height / 2])).toBe('TD');
  await ctx.close();
});
