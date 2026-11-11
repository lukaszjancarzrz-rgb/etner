import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}

test('finanse: Rozliczone → przychód ze zlecenia, ponowne Rozliczone bez okienka, import KPiR bez duplikatów', async ({ page }, info) => {
  const tag = `E2E fin ${info.project.name.replace(/\W/g, '')} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  // własne zlecenie na projekt (wspólna baza, oba projekty po kolei)
  const r = await page.request.post('/api/jobs', { data: { newClient: { typ: 'osoba', nazwa: tag }, status: 'Zaplanowane', rodzaj: 'Montaż', kategoria: 'Klimatyzacja' } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const job = (await r.json()) as { id: string; numer: string };
  await page.goto(`/#zl/${job.id}`);
  await expect(page.getByRole('heading', { name: tag, level: 2 })).toBeVisible();

  const zmien = async (status: string) => {
    await page.getByRole('button', { name: 'Edytuj' }).click();
    const jf = page.getByRole('dialog', { name: /^Zlecenie/ });
    await jf.getByLabel('Status').click();
    await page.getByRole('option', { name: status, exact: true }).click();
    await jf.getByRole('button', { name: 'Zapisz' }).click();
    await expect(jf).toBeHidden();
  };

  await zmien('Rozliczone');
  const pf = page.getByRole('dialog', { name: 'Przychód ze zlecenia' });
  await expect(pf.getByLabel('Klient')).toHaveValue(tag);
  await expect(pf.getByLabel('Opis')).toHaveValue('Montaż Klimatyzacja');
  await pf.getByLabel(/^Kwota/).fill('12 300');
  await pf.getByRole('radio', { name: 'Faktura VAT 23%' }).click();
  await expect(pf.getByRole('status')).toHaveText('Netto 10 000,00 zł · VAT 2 300,00 zł');
  await pf.getByRole('button', { name: 'Zapisz przychód' }).click();
  await expect(pf).toBeHidden();

  // ponowna zmiana: przychód już jest, więc bez okienka
  await zmien('W realizacji');
  await zmien('Rozliczone');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/#fin');
  await page.getByRole('button', { name: 'Cały rok' }).click();
  await page.getByLabel('Szukaj').fill(tag);
  await expect(page.getByRole('link', { name: job.numer })).toHaveCount(1);

  // import KPiR: plik syntetyczny, dwa razy ten sam
  const plik = {
    format: 'etner-kpir-1', miesiac: '2026-10', kpir: { przychod: 0, towary: 300, uboczne: 0, wynagrodzenia: 0, pozostale: 0 },
    koszty: [1, 2].map((n) => ({ data: '2026-10-0' + n, nrDokumentu: `${tag}/${n}`, kontrahent: `${tag} dostawca ${n}`, nip: '', opis: 'Materiały', kategoria: 'Materiały i towary', netto: 100 * n, kolumnaKpir: 12, doWyniku: true, uwagi: '' })),
  };
  const file = { name: 'kpir-2026-10.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plik)) };
  // komputer: przełącznik zakładek, telefon: lista wyboru
  const tabs = page.getByRole('radio', { name: 'Koszty' });
  if (await tabs.isVisible()) await tabs.click();
  else { await page.getByRole('combobox', { name: 'Widok' }).click(); await page.getByRole('option', { name: 'Koszty' }).click(); }
  const importuj = async () => {
    await page.getByRole('button', { name: 'Importuj miesiąc z KPiR' }).click();
    await page.getByTestId('kpir-file').setInputFiles(file);
  };
  await importuj();
  const imp = page.getByRole('dialog', { name: 'Importuj miesiąc z KPiR' });
  await expect(imp.getByRole('status')).toHaveText('Nowe pozycje: 2, pominięte duplikaty: 0.');
  await imp.getByRole('button', { name: 'Zapisz' }).click();
  await expect(imp).toBeHidden();
  await page.getByLabel('Miesiąc').fill('2026-10');
  await expect(page.getByText(`${tag} dostawca`)).toHaveCount(2);

  await importuj();
  await expect(imp.getByRole('status')).toHaveText('Nowe pozycje: 0, pominięte duplikaty: 2.');
  await imp.getByRole('button', { name: 'Anuluj' }).click();

  // edycja kosztu: klik w wiersz/kartę
  await page.getByText(`${tag} dostawca 1`).click();
  const kf = page.getByRole('dialog', { name: 'Koszt' });
  await kf.getByLabel('Kontrahent').fill(`${tag} hurtownia`);
  await kf.getByRole('radio', { name: 'Poza wynikiem' }).click();
  await kf.getByRole('button', { name: 'Zapisz koszt' }).click();
  await expect(kf).toBeHidden();
  await expect(page.getByText(`${tag} hurtownia`)).toHaveCount(1);
  await expect(page.getByText(`${tag} dostawca`)).toHaveCount(1);
});

test('finanse: pracownik nie widzi Finanse w menu, #fin → „Brak dostępu”', async ({ page }) => {
  await login(page, 'Bartek Gawlik');
  await expect(page.getByRole('link', { name: 'Finanse' })).toHaveCount(0);
  await page.goto('/#wiecej');
  await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Finanse' })).toHaveCount(0);
  await page.goto('/#fin');
  await expect(page.getByRole('heading', { name: 'Brak dostępu', level: 1 })).toBeVisible();
});

test('Finanse 3b: Wynik z kosztami pracowników, Kontrola KPiR, Statystyki', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('iPhone'), 'tabela miesięcy tylko na komputerze');
  await page.goto('/');
  await page.getByRole('button', { name: /Tomasz Wrona/ }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
  await page.goto('/#fin');
  await page.getByRole('radio', { name: 'Wynik' }).click();
  const tabela = page.getByRole('table', { name: /Wynik firmy/ });
  await expect(tabela).toBeVisible();
  await tabela.getByRole('button', { name: /Koszty pracowników .*-01/ }).click();
  await page.getByRole('dialog').getByLabel('Kwota (zł)').fill('1 234');
  await page.getByRole('dialog').getByRole('button', { name: 'Zapisz' }).click();
  await expect(tabela.getByRole('button', { name: /Koszty pracowników .*-01: 1234 zł/ })).toBeVisible();
  await page.getByRole('radio', { name: 'KPiR' }).click();
  await expect(page.getByRole('region', { name: /^KPiR / }).first()).toBeVisible();
  await page.getByRole('radio', { name: 'Statystyki' }).click();
  await expect(page.getByRole('region', { name: 'Czas pracy wg branży' })).toBeVisible();
});
