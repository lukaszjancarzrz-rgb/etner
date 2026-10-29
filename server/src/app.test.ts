import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { testDeps } from './test-utils.js';

describe('health', () => {
  it('zwraca ok i wersję', async () => {
    const res = await createApp(testDeps()).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 'test' });
  });
});

describe('limit danych JSON', () => {
  it('ponad 1 MB → 413 przed trasą; mniejsze przechodzą dalej', async () => {
    const app = createApp(testDeps());
    const big = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'x'.repeat(1024 * 1024) }) });
    expect(big.status).toBe(413);
    const small = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'x', haslo: 'y' }) });
    expect(small.status).toBe(401);
  });
});

describe('serwowanie web/dist', () => {
  const webDist = mkdtempSync(join(tmpdir(), 'etner-web-'));
  writeFileSync(join(webDist, 'index.html'), '<h1>ETNER</h1>');
  writeFileSync(join(webDist, 'app.js'), 'console.log(1)');
  const app = createApp(testDeps({ webDist }));

  it('serwuje plik statyczny', async () => {
    const res = await app.request('/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log(1)');
  });

  it('nieznana ścieżka spoza /api dostaje index.html', async () => {
    const res = await app.request('/zlecenia/123');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ETNER');
  });

  it('brakujący plik z rozszerzeniem to 404', async () => {
    expect((await app.request('/brak.js')).status).toBe(404);
  });

  it('nieznana ścieżka /api to 404 JSON, nie index.html', async () => {
    const res = await app.request('/api/nieznane');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Nie znaleziono' });
  });
});
