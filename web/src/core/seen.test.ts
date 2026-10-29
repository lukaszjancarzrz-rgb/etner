import { beforeEach, expect, it, vi } from 'vitest';

const posted: any[] = [];
vi.mock('./api.js', () => ({ api: vi.fn(async (_u: string, o: any) => { posted.push(o.json); return { ok: true }; }), emit: vi.fn() }));
vi.mock('./session.js', () => ({ useSession: () => ({}) }));
const { seenFor, uploadSeen, markSeen } = await import('./data.js');
const { store } = await import('./store.js');

const ls = new Map<string, string>();
beforeEach(() => {
  ls.clear(); posted.length = 0;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k),
    get length() { return ls.size; }, key: (i: number) => [...ls.keys()][i] ?? null,
  });
  store.replace([], 0);
});
// Object.keys(localStorage) w przeglądarce = klucze; tu odtwarzamy własnym polem (wartość nieistotna, czyta getItem)
const setLs = (k: string, v: string) => { ls.set(k, v); (localStorage as any)[k] = v; };

it('seenFor: późniejsza z serwera i z urządzenia; baza z serwera przed bazą urządzenia (Task 26)', () => {
  setLs('seen:u:j1', '2026-10-05T00:00:00.000Z');
  setLs('seen0:u', '2026-10-01T00:00:00.000Z');
  expect(seenFor('u')('j1')).toBe('2026-10-05T00:00:00.000Z');
  expect(seenFor('u')('j2')).toBe('2026-10-01T00:00:00.000Z');
  store.put('job_seen', { id: 's1', userId: 'u', jobId: 'j1', seenAt: '2026-10-09T00:00:00.000Z' });
  store.put('job_seen', { id: 's2', userId: 'u', jobId: '*', seenAt: '2026-09-01T00:00:00.000Z' });
  store.put('job_seen', { id: 's3', userId: 'inny', jobId: 'j2', seenAt: '2026-10-20T00:00:00.000Z' });
  expect(seenFor('u')('j1')).toBe('2026-10-09T00:00:00.000Z');
  expect(seenFor('u')('j2')).toBe('2026-09-01T00:00:00.000Z');
});

it('uploadSeen: wysyła lokalne nowsze niż serwer (tylko zlecenia w sklepie) i bazę, gdy serwer jej nie ma; markSeen wysyła od razu', () => {
  store.put('jobs', { id: 'j1' }); store.put('jobs', { id: 'j2' });
  store.put('job_seen', { id: 's1', userId: 'u', jobId: 'j2', seenAt: '2026-10-09T00:00:00.000Z' });
  setLs('seen:u:j1', '2026-10-05T00:00:00.000Z');
  setLs('seen:u:j2', '2026-10-05T00:00:00.000Z'); // starsze niż na serwerze
  setLs('seen:u:usuniete', '2026-10-05T00:00:00.000Z');
  setLs('seen:inny:j1', '2026-10-06T00:00:00.000Z');
  setLs('seen0:u', '2026-10-01T00:00:00.000Z');
  uploadSeen('u');
  expect(posted).toEqual([{ jobs: { j1: '2026-10-05T00:00:00.000Z' }, base: '2026-10-01T00:00:00.000Z' }]);
  posted.length = 0;
  store.put('job_seen', { id: 's2', userId: 'u', jobId: '*', seenAt: '2026-10-01T00:00:00.000Z' });
  store.put('job_seen', { id: 's3', userId: 'u', jobId: 'j1', seenAt: '2026-10-05T00:00:00.000Z' });
  uploadSeen('u');
  expect(posted).toEqual([]);
  markSeen('u', 'j1', false); // otwarcie karty: tylko localStorage
  expect(posted).toEqual([]);
  markSeen('u', 'j1');
  expect(Object.keys(posted[0].jobs)).toEqual(['j1']);
  expect(posted[0].base).toBe('2026-10-01T00:00:00.000Z'); // baza urządzenia razem z zapisem
});
