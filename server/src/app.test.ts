import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp, inlineScriptHashes } from './app.js';
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
  writeFileSync(join(webDist, 'index.html'), '<script>var t = 1;</script><h1>ETNER</h1>');
  writeFileSync(join(webDist, 'app.js'), 'console.log(1)');
  const app = createApp(testDeps({ webDist }));

  it('nagłówki bezpieczeństwa: CSP ze skrótem skryptu z index.html, czcionki Google, zdjęcia https i blob, bez ramek', async () => {
    const res = await app.request('/');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain(`script-src 'self' ${inlineScriptHashes('<script>var t = 1;</script>')[0]}`);
    expect(csp).toContain("img-src 'self' https: data: blob:");
    expect(csp).toContain('font-src \'self\' https://fonts.gstatic.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await app.request('/api/health')).headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

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
