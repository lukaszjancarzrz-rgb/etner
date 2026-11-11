import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();
}

test('płace: godziny wpisane w tabeli i zaliczka liczą „do wypłaty” w rozliczeniu miesiąca', async ({ page }, info) => {
  // osobny rok na projekt (wspólna baza demo)
  const rok = info.project.name.startsWith('iPhone') ? '2031' : '2032';
  await login(page, 'Tomasz Wrona');
  const people = (await (await page.request.get('/api/schedule-people')).json()) as { id: string; nazwa: string }[];
  const os = people[0]!;
  const ok = async (r: Promise<{ ok(): boolean; text(): Promise<string> }>) => { const x = await r; expect(x.ok(), await x.text()).toBeTruthy(); };
  await ok(page.request.put(`/api/payroll/people/${os.id}`, { data: { forma: 'brak', umowaOd: null, umowaDo: null, bruttoGr: null, kosztRecznyGr: null, kupGr: null, urlopDni: 0, etat: null, staz10: false, uwagi: '' } }));
  await ok(page.request.post('/api/payroll/rates', { data: { personId: os.id, odMiesiaca: `${rok}-01`, stawkaGr: 3000 } }));
  await ok(page.request.post('/api/payroll/entries', { data: { personId: os.id, miesiac: `${rok}-03`, dzien: null, rodzaj: 'zaliczka', kwotaGr: 100_000, opis: 'E2E' } }));

  await page.goto('/#place');
  const widok = async (nazwa: string) => {
    if (info.project.name.startsWith('iPhone')) { await page.getByLabel('Widok').click(); await page.getByRole('option', { name: nazwa }).click(); }
    else await page.getByRole('radio', { name: nazwa }).click();
  };
  const wybierz = async (label: string, opcja: string) => { await page.getByLabel(label, { exact: true }).click(); await page.getByRole('option', { name: opcja, exact: true }).click(); };
  await widok('Godziny');
  await wybierz('Rok', rok);
  const pole = page.getByLabel(new RegExp(`^Godziny ${os.nazwa}, Mar\\w* ${rok}$`));
  await pole.fill('100');
  await pole.press('Tab');
  await widok('Rozliczenie miesiąca');
  await wybierz('Miesiąc', 'Marzec');
  // 100 h × 30 zł − 1000 zł zaliczki
  await expect(page.getByLabel('Płace').getByText(/2\s000,00/).first()).toBeVisible();
});
