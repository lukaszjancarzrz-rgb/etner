import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}

test('klienci: edycja klienta zmienia adres obiektu i dodaje drugi, „+ Nowy obiekt” w zleceniu, paszport trzyma nowy adres', async ({ page }, info) => {
  const tag = `E2E obj ${info.project.name.replace(/\W/g, '')} ${Date.now() % 100000}`;
  await login(page, 'Tomasz Wrona');
  const r = await page.request.post('/api/jobs', { data: { newClient: { typ: 'osoba', nazwa: tag }, newSite: { nazwa: '', adres: 'Stara 1', miejscowosc: 'Kielce', mapa: '', opis: '' }, status: 'Zaplanowane', rodzaj: 'Montaż', kategoria: 'Klimatyzacja' } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const job = (await r.json()) as { id: string; clientId: string; siteId: string };
  const pr = await page.request.post('/api/passports', { data: { siteId: job.siteId } });
  expect(pr.ok(), await pr.text()).toBeTruthy();
  const passport = (await pr.json()) as { id: string };

  await page.goto(`/#kl/${job.clientId}`);
  await expect(page.getByRole('heading', { name: tag, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Edytuj klienta' }).click();
  const dlg = page.getByRole('dialog', { name: 'Edycja klienta' });
  await expect(dlg.getByText('Paszport', { exact: true })).toBeVisible();
  await expect(dlg.getByText('Zmiana adresu zmieni adres w paszporcie klienta.')).toBeVisible();
  await dlg.getByLabel('Adres: Stara 1, Kielce').fill('Nowa 2');
  await dlg.getByRole('button', { name: 'Dodaj obiekt' }).click();
  await dlg.getByLabel('Nazwa: nowy obiekt').fill('Magazyn');
  await dlg.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dlg).toBeHidden();

  await expect(page.getByText('Nowa 2, Kielce').first()).toBeVisible();
  await expect(page.getByText('Magazyn').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Edytuj obiekt/ })).toHaveCount(0);
  // paszport: ten sam, sekcja nadal na karcie, publiczna strona czyta nowy adres
  await expect(page.getByRole('region', { name: /Paszport instalacji/ }).first()).toBeVisible();
  const link = await page.request.post(`/api/passports/${passport.id}/link`);
  expect(link.ok(), await link.text()).toBeTruthy();
  const { url } = (await link.json()) as { url: string };
  const pub = await page.request.get('/p/' + url.split('/p/')[1]);
  expect(await pub.text()).toContain('Nowa 2');

  // nowe zlecenie: wybór klienta i „+ Nowy obiekt” zaznacza utworzony obiekt
  await page.goto('/#zl');
  await page.getByRole('button', { name: 'Nowe zlecenie' }).click();
  const jf = page.getByRole('dialog', { name: 'Nowe zlecenie' });
  await jf.getByLabel('Klient').click();
  await page.getByPlaceholder('Nazwisko, firma, telefon').fill(tag);
  await page.getByRole('option', { name: tag }).click();
  await expect(jf.getByLabel('Obiekt')).toBeVisible();
  await jf.getByRole('button', { name: 'Nowy obiekt' }).click();
  const sf = page.getByRole('dialog', { name: 'Nowy obiekt' });
  await sf.getByLabel('Adres').fill('Trzecia 3');
  await sf.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sf).toBeHidden();
  await expect(jf).toBeVisible();
  await expect(jf.getByLabel('Obiekt')).toContainText('Trzecia 3');
});
