import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const photo = fileURLToPath(new URL('./fixtures/zdjecie.jpg', import.meta.url));
const shots = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-20-etner-modul-1/shots/', import.meta.url));

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}
const phone = (info: { project: { name: string } }) => info.project.name.startsWith('iPhone');

test('dziennik: „Oryginał” w aplikacji, „wstecz” zamyka warstwy; usunięcie wpisu z potwierdzeniem', async ({ page }, info) => {
  const tag = `E2E 24B ${info.project.name}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  const card = new URL(page.url()).hash;

  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(`${tag}: do usunięcia`);
  await page.locator('input[data-gallery]').setInputFiles(photo);
  await expect(page.getByRole('list', { name: 'Wybrane pliki' }).getByRole('img', { name: 'zdjecie.jpg' })).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  const entry = page.locator('li[id^="e-"]', { hasText: `${tag}: do usunięcia` });
  await expect(entry).not.toContainText('wysyłanie');

  // podgląd → Oryginał: pełna rozdzielczość w aplikacji, adres się nie zmienia
  await entry.getByRole('button', { name: /Zdjęcie/ }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByText(/Zdjęcie 1 z \d+/)).toBeVisible();
  await viewer.getByRole('button', { name: 'Oryginał' }).click();
  const orig = viewer.getByRole('group', { name: 'Oryginał zdjęcia' });
  await expect(orig).toBeVisible();
  await expect.poll(() => orig.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  expect(new URL(page.url()).hash).toBe(card);
  if (phone(info)) await page.screenshot({ path: `${shots}task24B-phone-original.png` });

  // „wstecz” (Android / przeglądarka): najpierw oryginał, potem podgląd; aplikacja zostaje na karcie zlecenia
  await page.goBack();
  await expect(orig).toBeHidden();
  await expect(viewer.getByText(/Zdjęcie 1 z \d+/)).toBeVisible();
  await page.goBack();
  await expect(viewer).toBeHidden();
  expect(new URL(page.url()).hash).toBe(card);
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();

  // zamknięcie przyciskiem zdejmuje swój wpis historii: „wstecz” potem wychodzi z karty jak zwykle
  await entry.getByRole('button', { name: /Zdjęcie/ }).click();
  await viewer.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(viewer).toBeHidden();
  expect(new URL(page.url()).hash).toBe(card);

  // usunięcie: drugi klik potwierdza; po odświeżeniu wpisu nie ma
  await entry.getByRole('button', { name: 'Usuń wpis' }).click();
  const confirm = entry.getByRole('group', { name: 'Potwierdź usunięcie wpisu' });
  await expect(confirm.getByRole('button', { name: 'Usunąć wpis i załącznik?' })).toBeVisible();
  await entry.scrollIntoViewIfNeeded();
  if (phone(info)) await page.screenshot({ path: `${shots}task24B-phone-delete-confirm.png` });
  await confirm.getByRole('button', { name: 'Anuluj' }).click();
  await expect(entry.getByRole('button', { name: 'Usuń wpis' })).toBeVisible();
  await entry.getByRole('button', { name: 'Usuń wpis' }).click();
  await confirm.getByRole('button', { name: 'Usunąć wpis i załącznik?' }).click();
  await expect(entry).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  await expect(page.locator('li[id^="e-"]', { hasText: `${tag}: do usunięcia` })).toHaveCount(0);
});

test('klienci: admin widzi możliwe duplikaty i łączy je; „Połącz z…” na karcie', async ({ page }, info) => {
  const t = info.project.name.replace(/\s+/g, '');
  await login(page, 'Tomasz Wrona');
  const mk = async (nazwa: string, extra: Record<string, unknown>) =>
    ((await (await page.request.post('/api/clients', { data: { nazwa, ...extra } })).json()) as { client: { id: string } }).client.id;
  const a = await mk(`Duplikat Nowak ${t}`, { telefony: [phone(info) ? '501 111 222' : '502 111 222'] });
  const b = await mk(`nowak  duplikat ${t}`, { emaile: [`nowak-${t}@przyklad.pl`], site: { miejscowosc: `Sucha ${t}` } });
  const c = await mk(`Ręczny ${t}`, {});

  await page.goto('/#kl');
  const dups = page.getByRole('region', { name: 'Możliwe duplikaty' });
  const pair = dups.locator('li', { hasText: `Duplikat Nowak ${t}` });
  await expect(pair).toContainText('ta sama nazwa');
  await pair.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}task24B-${phone(info) ? 'phone' : 'desktop'}-klienci-duplikaty.png` });
  await pair.getByRole('button', { name: /^Połącz:/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Połącz klientów' });
  await expect(dlg.getByRole('radio', { name: /Zostaje.*Duplikat Nowak/ })).toHaveAttribute('aria-checked', 'true');
  if (!phone(info)) await page.screenshot({ path: `${shots}task24B-desktop-polacz.png` });
  await dlg.getByRole('button', { name: 'Połącz', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(dups.locator('li', { hasText: `Duplikat Nowak ${t}` })).toHaveCount(0);

  // główny ma obiekt i e-mail duplikatu; duplikat zniknął (też po odświeżeniu)
  await page.goto(`/#kl/${a}`);
  await expect(page.getByText(`Sucha ${t}`).first()).toBeVisible();
  await expect(page.getByRole('link', { name: `nowak-${t}@przyklad.pl` })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Sucha ${t}`).first()).toBeVisible();
  await page.goto(`/#kl/${b}`);
  await expect(page.getByText('Nie ma takiego klienta')).toBeVisible();

  // ręcznie: z karty „Ręczny” wybór drugiego klienta, „Ręczny” znika, przejście na głównego
  await page.goto(`/#kl/${c}`);
  await page.getByRole('button', { name: 'Połącz z…' }).click();
  await dlg.getByLabel('Połącz z').click();
  await page.getByPlaceholder('Nazwisko, firma').fill(`Duplikat Nowak ${t}`);
  await page.getByRole('option', { name: `Duplikat Nowak ${t}` }).click();
  await dlg.getByRole('radio', { name: /Duplikat Nowak/ }).click();
  await dlg.getByRole('button', { name: 'Połącz', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#kl/${a}$`));
  await expect(page.getByRole('heading', { name: `Duplikat Nowak ${t}`, level: 2 })).toBeVisible();
});
