import { expect, test, type Page } from '@playwright/test';
import { addDays, dayOf } from '@etner/shared';

/** Logowanie kontem demo z listy na ekranie logowania. */
async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}
const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

test('leady: nowy lead, kontakt, „Zrób zlecenie” → karta zlecenia z klientem i punktem zakresu, lead Przyjęta', async ({ page }, info) => {
  const phone = info.project.name.startsWith('iPhone');
  const [who, town] = phone ? ['Janina Targosz', 'Jordanów'] : ['Krzysztof Łasak', 'Białka'];
  const tag = `E2E ${info.project.name}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#leady');
  await expect(page.getByRole('heading', { name: 'Zaległe kontakty' })).toBeVisible(); // demo: lead z terminem sprzed 2 dni

  await page.getByRole('button', { name: 'Nowy lead' }).click();
  const form = page.getByRole('dialog', { name: 'Nowy lead' });
  await form.getByLabel('Klient').click();
  await page.getByPlaceholder('Nazwisko, firma, telefon').fill(who);
  await page.getByRole('option', { name: who }).click();
  await form.getByLabel('Temat').fill(`${tag} klimatyzacja`);
  await form.getByLabel('Kategoria').click();
  await page.getByRole('option', { name: 'Klimatyzacja' }).click();
  await form.getByLabel('Opis').fill(`${tag}: dwie jednostki w salonie`);
  await form.getByLabel(/^Wartość/).fill('12 500');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('heading', { name: who, level: 2 })).toBeVisible();
  const leadHash = new URL(page.url()).hash;
  expect(leadHash).toMatch(/^#ld\//);
  await expect(page.getByText('12 500,00 zł')).toBeVisible();

  // Kontakt z następnym terminem
  const next = addDays(dayOf(new Date()), 3);
  await page.getByLabel('Notatka z kontaktu').fill(`${tag}: umówiona wizja`);
  await page.getByLabel('Następny kontakt').fill(next);
  await page.getByRole('button', { name: 'Zapisz kontakt' }).click();
  const contact = page.locator('ol > li', { hasText: `${tag}: umówiona wizja` });
  await expect(contact).toBeVisible();
  await expect(contact).not.toContainText('wysyłanie');
  await expect(contact).toContainText(`następny: ${fmt(next)}`);

  // Zrób zlecenie: formularz zlecenia wypełniony z leada
  await page.getByRole('button', { name: 'Zrób zlecenie' }).click();
  const jf = page.getByRole('dialog', { name: /^Zlecenie z leada L\d+/ });
  await expect(jf.getByText(who)).toBeVisible();
  await expect(jf.getByLabel('Zakres prac (punkt 1)')).toHaveValue(`${tag}: dwie jednostki w salonie`);
  await expect(jf.getByRole('checkbox', { name: 'Oznacz lead jako Przyjęta' })).toHaveAttribute('aria-checked', 'true');
  await expect(jf.getByLabel('Status')).toHaveText('Nowe');
  await expect(jf.getByLabel('Kategoria')).toHaveText('Klimatyzacja');
  await jf.getByRole('button', { name: 'Zapisz' }).click();
  await expect(jf).toBeHidden();
  await expect(page).toHaveURL(/#zl\//);
  await expect(page.getByRole('heading', { name: who, level: 2 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Zakres prac' }).getByText(`${tag}: dwie jednostki w salonie`)).toBeVisible();

  // Lead: Przyjęta i link do zlecenia zamiast „Zrób zlecenie”
  await page.goto(`/${leadHash}`);
  await expect(page.getByLabel('Status leada')).toHaveText('Przyjęta');
  await expect(page.getByRole('link', { name: `Zlecenie: ${who} – ${town}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zrób zlecenie' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Status leada')).toHaveText('Przyjęta');
});

test('leady: link z powiadomienia `#ld/<lead>~<wpis>` otwiera lead i podświetla wpis', async ({ page }) => {
  await login(page, 'Tomasz Wrona');
  await page.goto('/#leady');
  await page.getByRole('link', { name: /Instalacja elektryczna w garażu/ }).click(); // demo: wpis dziennika ma ostatni lead (L0006)
  const entry = page.locator('li[id^="e-"]', { hasText: 'Zadzwonić we wtorek' });
  await expect(entry).toBeVisible();
  const [leadId, entryId] = [new URL(page.url()).hash.slice(4), (await entry.getAttribute('id'))!.slice(2)];
  await page.goto('/#harm');
  await page.goto(`/#ld/${leadId}~${entryId}`);
  await expect(entry).toHaveClass(/ring-4/);
  await expect(entry).toBeInViewport();
});

test('pracownik: bez Leady i Zadania w menu, adres #leady i #zad pokazuje „Brak dostępu”', async ({ page }) => {
  await login(page, 'Bartek Gawlik');
  await expect(page.getByRole('link', { name: 'Leady' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Zadania' })).toHaveCount(0);
  await page.goto('/#wiecej');
  await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Leady|Zadania/ })).toHaveCount(0);
  for (const h of ['#leady', '#zad', '#ld/01ABC']) {
    await page.goto(`/${h}`);
    await expect(page.getByRole('heading', { name: 'Brak dostępu', level: 1 })).toBeVisible();
  }
});

test('na jutro: pracownik dodaje i odhacza rzecz swojej ekipy; admin otwiera `#jutro~<id>` innej ekipy', async ({ page, browser }, info) => {
  const tag = `E2E ${info.project.name} wiertła`;
  await login(page, 'Bartek Gawlik');
  await page.goto('/#jutro');
  await expect(page.getByText('ekipa Bartek', { exact: true })).toBeVisible();
  await expect(page.getByText(/^jutro, /)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Ekipa' })).toHaveCount(0); // pracownik: tylko swoja ekipa
  await page.getByPlaceholder('Co zabrać? Enter dodaje').fill(tag);
  await page.getByPlaceholder('Co zabrać? Enter dodaje').press('Enter');
  const item = page.locator('li[id^="j-"]', { hasText: tag });
  await expect(item).toContainText('dodał Bartek Gawlik');
  await item.getByRole('checkbox', { name: `Zabrane: ${tag}` }).click();
  await expect(item).toContainText('zabrał Bartek Gawlik');
  await page.reload();
  await expect(page.locator('li[id^="j-"]', { hasText: tag }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

  const ctx = await browser.newContext({ ...info.project.use });
  const a = await ctx.newPage();
  await login(a, 'Tomasz Wrona');
  const list = (await (await a.request.get('/api/checklists')).json()) as { id: string; ekipa: string; tekst: string }[];
  const marek = list.find((r) => r.ekipa === 'ekipa Marek')!;
  await a.goto(`/#jutro~${marek.id}`);
  await expect(a.getByRole('radio', { name: 'ekipa Marek' })).toHaveAttribute('aria-checked', 'true');
  await expect(a.locator(`#j-${marek.id}`)).toHaveAttribute('data-flash', 'true');
  await ctx.close();
});

test('zadania: admin dodaje zadanie, odhacza je; cykliczne wraca z datą „ostatnio”', async ({ page }, info) => {
  const tag = `E2E ${info.project.name} zadanie`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#zad');
  await page.getByLabel('Nowe zadanie').fill(tag);
  await page.getByLabel('Nowe zadanie').press('Enter');
  const task = page.locator('li', { hasText: tag });
  await expect(task).toBeVisible();
  await expect(task).not.toContainText('wysyłanie');
  await page.reload();
  await expect(task).toBeVisible();
  await task.getByRole('checkbox', { name: `Zrobione: ${tag}` }).click();
  await expect(task).toHaveCount(0); // do zwiniętej sekcji Zrobione
  await page.getByRole('button', { name: /Zrobione/ }).click();
  await expect(task.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

  const cyc = page.locator('li', { hasText: 'Kalibracja manometrów' });
  await cyc.getByRole('checkbox').click();
  await expect(cyc).toContainText(`ostatnio ${fmt(dayOf(new Date()))}`);
  await expect(cyc.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
});

test('użytkownicy: admin tworzy pracownika z wygenerowanym hasłem, ten się loguje; reset hasła wylogowuje starą sesję', async ({ page, browser }, info) => {
  const login = `e2e${info.project.name.startsWith('iPhone') ? 'i' : 'd'}${Date.now() % 100000}`;
  const name = `Testowy ${login}`;
  await page.goto('/');
  await page.getByRole('button', { name: /Tomasz Wrona/ }).click();
  await page.goto('/#uz');
  await page.getByRole('button', { name: 'Nowy użytkownik' }).click();
  const f = page.getByRole('dialog', { name: 'Nowy użytkownik' });
  await f.getByLabel('Imię i nazwisko').fill(name);
  await f.getByLabel('Login').fill(login);
  await f.getByRole('button', { name: 'Generuj' }).click();
  const haslo = await f.getByLabel('Hasło startowe').inputValue();
  expect(haslo).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
  await expect(f.getByRole('checkbox', { name: 'Wiersz w harmonogramie' })).toHaveAttribute('aria-checked', 'true'); // pracownik: domyślnie tak
  await f.getByRole('button', { name: 'Utwórz konto' }).click();
  const shown = page.getByRole('dialog', { name: 'Konto utworzone' });
  await expect(shown.getByTestId('login')).toHaveText(login);
  await expect(shown.getByTestId('haslo')).toHaveText(haslo);
  await shown.getByRole('button', { name: 'Gotowe' }).click();
  const row = page.getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(row).toContainText(`login: ${login}`);
  await expect(row).toContainText('wiersz w harmonogramie');

  // nowy pracownik loguje się w osobnym kontekście
  const ctx = await browser.newContext({ ...info.project.use });
  const w = await ctx.newPage();
  await w.goto('/');
  await w.getByLabel('Login').fill(login);
  await w.getByLabel('Hasło', { exact: true }).fill(haslo);
  await w.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(w.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();

  // admin ustawia nowe hasło: stara sesja pracownika kończy się
  await row.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ustaw nowe hasło' }).click();
  const r = page.getByRole('dialog', { name: 'Ustaw nowe hasło' });
  await expect(r).toContainText('Wszystkie jego sesje zostaną zakończone');
  await r.getByRole('button', { name: 'Ustaw hasło i wyloguj' }).click();
  await expect(page.getByRole('dialog', { name: 'Nowe hasło ustawione' })).toContainText('Wylogowaliśmy go');
  await expect(w.getByRole('button', { name: 'Zaloguj się ponownie' })).toBeVisible();
  await ctx.close();
});

test('słowniki: admin dodaje rodzaj zlecenia, wartość jest w formularzu zlecenia', async ({ page }, info) => {
  const val = `e2e rodzaj ${info.project.name}`;
  await login(page, 'Tomasz Wrona');
  await page.goto('/#ust');
  const s = page.getByRole('region', { name: 'Słowniki' });
  await s.getByRole('combobox', { name: 'Słownik' }).click();
  await page.getByRole('option', { name: 'Rodzaje zleceń' }).click();
  await s.getByLabel('Nowa wartość').fill(val);
  await s.getByRole('button', { name: 'Dodaj' }).click();
  await s.getByRole('button', { name: 'Zapisz słownik' }).click();
  await expect(page.getByText('Słownik zapisany', { exact: true })).toBeVisible();
  await page.goto('/#zl');
  await page.getByRole('button', { name: 'Nowe zlecenie' }).click();
  await page.getByRole('dialog', { name: 'Nowe zlecenie' }).getByLabel('Rodzaj').click();
  await expect(page.getByRole('option', { name: val })).toBeVisible();
});

test('pracownik: bez Użytkowników, `#uz` pokazuje „Brak dostępu”; Ustawienia bez słowników', async ({ page }) => {
  await login(page, 'Bartek Gawlik');
  await page.goto('/#wiecej');
  await expect(page.getByRole('link', { name: /Użytkownicy/ })).toHaveCount(0);
  await page.goto('/#uz');
  await expect(page.getByRole('heading', { name: 'Brak dostępu', level: 1 })).toBeVisible();
  await page.goto('/#ust');
  await expect(page.getByRole('heading', { name: 'Zmień hasło' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Słowniki' })).toHaveCount(0);
});

test('powiadomienia: `#zl/<id>~<wpis>` otwiera zlecenie i podświetla wpis, `#zakupy~<id>` podświetla zakup', async ({ page }, info) => {
  await login(page, 'Tomasz Wrona');
  const jobs = (await (await page.request.get('/api/jobs')).json()) as { id: string }[];
  const job = jobs.at(-1)!;
  const tekst = `E2E ${info.project.name} wpis do podświetlenia`;
  const res = await page.request.post('/api/diary', { data: { owner_type: 'job', owner_id: job.id, tekst } });
  const created = await res.json();
  const entryId = (created.id ?? created.entry?.id) as string;
  await page.goto('/#harm');
  await page.goto(`/#zl/${job.id}~${entryId}`);
  const entry = page.locator(`#e-${entryId}`);
  await expect(entry).toContainText(tekst);
  await expect(entry).toHaveClass(/ring-4/);
  await expect(entry).toBeInViewport();

  const shop = (await (await page.request.get('/api/shopping')).json()) as { id: string }[];
  await page.goto(`/#zakupy~${shop[0]!.id}`);
  await expect(page.locator(`#z-${shop[0]!.id}`)).toHaveClass(/ring-4/);
});
