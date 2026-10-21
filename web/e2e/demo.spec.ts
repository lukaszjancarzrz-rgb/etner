import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const photo = fileURLToPath(new URL('./fixtures/zdjecie.jpg', import.meta.url));

async function loginAdmin(page: Page) {
  const links = (await (await page.request.get('/api/demo/links')).json()) as { role: string; link: string }[];
  const admin = links.find((l) => l.role === 'admin')!;
  await page.goto(admin.link);
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gdzie jedziesz' })).toBeVisible();
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
