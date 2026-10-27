import { expect, test, type Browser, type Page } from '@playwright/test';
import { addDays, dayOf, isWorkday } from '@etner/shared';

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}
async function as(browser: Browser, name: string, info: { project: { use: object } }) {
  const ctx = await browser.newContext(info.project.use);
  const page = await ctx.newPage();
  await login(page, name);
  return page;
}
const nextWd = (d: string) => { let x = addDays(d, 1); while (isWorkday(x, []) !== 1) x = addDays(x, 1); return x; };

test('samochody: pracownik zgłasza usterkę, admin planuje naprawę; ekipa auta ma dzień naprawy w harmonogramie', async ({ page, browser }, info) => {
  const tag = `E2E ${info.project.name}`;
  await login(page, 'Marek Pilch');
  // demo: Mała Toyota (ekipa Marek) w naprawie w drugi dzień roboczy od dziś
  const rep = nextWd(nextWd(dayOf(new Date())));
  await page.goto(`/#harm/${rep}`);
  await expect(page.locator(`[data-cell="${rep}|Marek Pilch"]`)).toContainText('Mała Toyota w naprawie');
  await expect(page.locator(`[data-cell="${rep}|Bartek Gawlik"]`)).not.toContainText('w naprawie');

  await page.goto('/#auta');
  const car = page.getByRole('article', { name: 'Mała Toyota' });
  await expect(car.getByText('Zaświecił się check engine')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Naprawa:/ })).toHaveCount(0); // pracownik: bez planowania
  await car.getByLabel('Nowa usterka').fill(`${tag}: pisk paska`);
  await car.getByRole('button', { name: 'Zgłoś usterkę: Mała Toyota' }).click();
  const item = car.locator('li', { hasText: `${tag}: pisk paska` });
  await expect(item).toContainText('Marek Pilch');
  await expect(item).not.toContainText('wysyłanie');

  // admin: naprawa za 3 tygodnie (dzień roboczy)
  const day = nextWd(addDays(dayOf(new Date()), info.project.name.startsWith('iPhone') ? 20 : 22));
  const admin = await as(browser, 'Tomasz Wrona', info);
  await admin.goto('/#auta');
  await admin.getByRole('button', { name: `Naprawa: ${tag}: pisk paska` }).click();
  const dlg = admin.getByRole('dialog', { name: 'Naprawa' });
  await dlg.getByLabel('Dzień naprawy').fill(day);
  await dlg.getByRole('button', { name: 'Zaplanuj' }).click();
  await expect(dlg).toBeHidden();
  await expect(admin.getByRole('article', { name: 'Mała Toyota' }).locator('li', { hasText: `${tag}: pisk paska` })).toContainText('naprawa');

  await page.goto(`/#harm/${day}`);
  await expect(page.locator(`[data-cell="${day}|Marek Pilch"]`)).toContainText('Mała Toyota w naprawie');
  // usunięta usterka: oznaczenie znika
  await admin.getByRole('button', { name: `Usuń usterkę: ${tag}: pisk paska` }).click();
  await page.goto('/#auta');
  await expect(page.getByText(`${tag}: pisk paska`)).toHaveCount(0);
  await page.goto(`/#harm/${day}`);
  await expect(page.locator(`[data-cell="${day}|Marek Pilch"]`)).not.toContainText('w naprawie');
  await admin.context().close();
});
