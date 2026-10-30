import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Port i katalog danych liczone raz; procesy robocze Playwright dziedziczą je przez env.
if (!process.env.E2E_PORT) {
  process.env.E2E_PORT = String(await new Promise<number>((res) => {
    const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
  }));
  process.env.E2E_DATA = mkdtempSync(join(tmpdir(), 'etner-e2e-'));
}
const port = Number(process.env.E2E_PORT);
// Chromium w środowisku bez `playwright install`; poza nim Playwright używa własnej przeglądarki.
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(local) ? { executablePath: local } : {};

export default defineConfig({
  testDir: 'e2e',
  globalTeardown: './e2e/teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // wspólna baza demo: szkice i zatwierdzanie po kolei
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', locale: 'pl-PL', timezoneId: 'Europe/Warsaw' },
  projects: [
    { name: 'iPhone 13', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions } },
    { name: 'Desktop 1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
  ],
  webServer: {
    command: 'node ../server/dist/main.js',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DEMO: '1', PUMBLE_FAKE: '1', DATA_DIR: process.env.E2E_DATA!, PORT: String(port), NODE_ENV: 'test' },
  },
});
