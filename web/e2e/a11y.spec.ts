import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Ekrany z menu (hash → nagłówek h1); karta zlecenia i leada otwierane z listy. */
const SCREENS: [string, string][] = [
  ['#harm', 'Harmonogram'], ['#jutro', 'Na jutro'], ['#zl', 'Zlecenia'], ['#zakupy', 'Zakupy'], ['#auta', 'Samochody'],
  ['#narz', 'Narzędzia'], ['#mag', 'Rzeczy nietypowe'], ['#leady', 'Leady'], ['#zad', 'Zadania'], ['#uz', 'Użytkownicy'], ['#ust', 'Ustawienia'],
];

/** Naruszenia WCAG 2.1 A/AA o wadze „serious” i „critical”, opisane do komunikatu błędu. */
async function audit(page: Page, where: string): Promise<string[]> {
  await page.waitForTimeout(400); // szkielety ładowania → treść
  // znak ETNER to logotyp (WCAG 1.4.3 go wyłącza): kolor marki zostaje
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-logo]').analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.length}× – ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const theme of ['light', 'dark'] as const) {
  test(`dostępność (${theme}): ekrany bez naruszeń serious/critical`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const phone = info.project.name.startsWith('iPhone');
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const found: string[] = [];

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
    found.push(...(await audit(page, 'logowanie')));
    await page.getByRole('button', { name: /Tomasz Wrona/ }).click();
    await expect(page.getByRole('heading', { name: 'Harmonogram', level: 1 })).toBeVisible();

    for (const [hash, title] of SCREENS) {
      await page.goto(`/${hash}`);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      found.push(...(await audit(page, hash)));
    }
    if (!phone) { // miesiąc jest tylko na komputerze
      await page.goto('/#harm');
      await page.getByRole('radio', { name: 'Miesiąc' }).click();
      found.push(...(await audit(page, '#harm miesiąc')));
      await page.getByRole('radio', { name: 'Tydzień' }).click();
    }

    await page.goto('/#zl');
    await page.getByRole('link', { name: /Józef Bukowski/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Józef Bukowski', level: 2 })).toBeVisible();
    found.push(...(await audit(page, 'karta zlecenia')));

    await page.goto('/#leady');
    await page.getByRole('link', { name: /Instalacja elektryczna w garażu/ }).click();
    await expect(page.locator('li[id^="e-"]', { hasText: 'Zadzwonić we wtorek' })).toBeVisible();
    found.push(...(await audit(page, 'karta leada')));

    expect(found).toEqual([]);
  });
}
