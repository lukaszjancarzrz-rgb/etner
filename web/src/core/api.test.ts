import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('limit czasu 20 s dla zwykłych zapytań, bez limitu dla plików; przekroczenie nie jest ApiError (kolejka ponawia)', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { seen.push(init.signal ?? undefined); return new Response('{}'); }));
    await api('/x', { method: 'POST', json: {} });
    await api('/u', { method: 'POST', body: new FormData() });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[1]).toBeUndefined();
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason))));
    await expect(api('/x', { timeout: 10 })).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
