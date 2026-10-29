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

test('wpis jednego admina jest „nowy” dla drugiego admina na tym samym urządzeniu', async ({ page }, info) => {
  const tag = `E2E 2adm ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(tag);
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  await expect(page.locator('li[id^="e-"]', { hasText: tag })).not.toContainText('wysyłanie');
  await page.context().clearCookies(); // wylogowanie: następny admin na tym samym urządzeniu (localStorage zostaje)
  await login(page, 'Anna Syrek');
  await page.goto('/#zl');
  await expect(page.getByRole('link', { name: /Józef Bukowski/ }).first()).toContainText(/nowy|nowe/);
});

test('karta zlecenia: „nowe” przy cudzym wpisie i zmienionym polu po świeżym logowaniu na innym komputerze; po ponownym otwarciu znika (Task 26)', async ({ page, browser }, info) => {
  const tag = `E2E 26 ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  const card = new URL(page.url()).hash;
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(tag);
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  await expect(page.locator('li[id^="e-"]', { hasText: tag })).not.toContainText('wysyłanie');
  await page.getByRole('button', { name: 'Edytuj' }).first().click();
  await page.getByLabel('Uwagi admina').fill(`Uwagi ${tag}`);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('p', { hasText: `Uwagi ${tag}` })).toBeVisible();
  await expect.poll(() => page.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).uwagiAdmin, card.split('/')[1])).toBe(`Uwagi ${tag}`);

  // drugi admin na innym komputerze, świeże logowanie (bez historii w telefonie): znaczniki z serwera
  const ctx = await browser.newContext({ ...(info.project.use as object), baseURL: info.project.use.baseURL });
  const b = await ctx.newPage();
  await login(b, 'Anna Syrek');
  await b.goto(`/${card}`);
  const entry = b.locator('li[id^="e-"]', { hasText: tag });
  const uwagi = b.locator('p', { hasText: 'Uwagi admina' });
  await expect(entry.getByText('nowe', { exact: true })).toBeVisible();
  await expect(entry).toContainText('nowy wpis od ostatniej wizyty');
  await expect(uwagi.getByText('nowe', { exact: true })).toBeVisible();
  // własny wpis A nie jest „nowy” dla A
  await expect(page.locator('li[id^="e-"]', { hasText: tag }).getByText('nowe', { exact: true })).toHaveCount(0);
  await entry.scrollIntoViewIfNeeded();
  await b.screenshot({ path: `${shots}task26-${phone(info) ? 'phone' : 'desktop'}-wpis.png` });
  await uwagi.scrollIntoViewIfNeeded();
  await b.screenshot({ path: `${shots}task26-${phone(info) ? 'phone' : 'desktop'}-pole.png` });

  // wyjście z karty i powrót: obejrzane, znaczniki znikają
  await b.goto('/#zl');
  await expect(b.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeHidden(); // karta zamknięta: markSeen
  await b.goto(`/${card}`);
  await expect(entry).toBeVisible();
  await expect(entry.getByText('nowe', { exact: true })).toHaveCount(0);
  await expect(uwagi.getByText('nowe', { exact: true })).toHaveCount(0);
  await ctx.close();
});

test('karta zlecenia otwarta przy wylogowaniu: drugi admin logujący się na tym urządzeniu widzi „nowe” na tej karcie (Task 26)', async ({ page }, info) => {
  const tag = `E2E 26b ${info.project.name} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#zl');
  await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  const card = new URL(page.url()).hash;
  await page.getByPlaceholder('Co zrobiono, czego brakuje').fill(tag);
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  await expect(page.locator('li[id^="e-"]', { hasText: tag })).not.toContainText('wysyłanie');
  // wylogowanie z otwartą kartą; następny admin loguje się z tym samym adresem karty (świeży sklep, snapshot)
  await page.context().clearCookies();
  await page.reload(); // ten sam adres karty
  await page.getByRole('button', { name: /Anna Syrek/ }).click();
  await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(card);
  const entry = page.locator('li[id^="e-"]', { hasText: tag });
  await expect(entry.getByText('nowe', { exact: true })).toBeVisible();
});
