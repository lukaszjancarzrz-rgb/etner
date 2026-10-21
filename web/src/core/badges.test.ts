import { describe, expect, it } from 'vitest';
import { badgeText, freshByJob, harmonogramCount, naJutroCount, zakupyCount } from './badges.js';

const T0 = '2026-10-21T08:00:00.000Z', T1 = '2026-10-21T09:00:00.000Z', T2 = '2026-10-21T10:00:00.000Z';
const r = (o: Record<string, unknown>) => ({ id: Math.random().toString(36), createdAt: T0, updatedAt: T0, ...o }) as any;

describe('liczniki w menu', () => {
  it('freshByJob: cudze wpisy, zmiany zakresu i zlecenia po wizycie; własne i stare pomija', () => {
    const jobs = [r({ id: 'j1', updatedAt: T2, createdBy: 'adm' }), r({ id: 'j2', createdBy: 'me', createdAt: T2, updatedAt: T2 }), r({ id: 'j3' })];
    const entries = [
      r({ ownerType: 'job', ownerId: 'j1', authorId: 'w', createdAt: T2 }), r({ ownerType: 'job', ownerId: 'j1', authorId: 'me', createdAt: T2 }),
      r({ ownerType: 'job', ownerId: 'j3', authorId: 'w', createdAt: T0 }), r({ ownerType: 'lead', ownerId: 'j3', authorId: 'w', createdAt: T2 }),
      r({ ownerType: 'job', ownerId: 'j3', authorId: 'w', createdAt: T2, _tmp: true }),
    ];
    const scope = [r({ jobId: 'j3', createdBy: 'adm', updatedAt: T2 }), r({ jobId: 'j3', createdBy: 'adm', updatedAt: T0 })];
    const m = freshByJob(jobs, entries, scope, 'me', () => T1);
    expect(Object.fromEntries(m)).toEqual({ j1: 2, j3: 1 });
    expect(freshByJob(jobs, entries, scope, 'me', () => T2).size).toBe(0);
    // pracownik: sama zmiana wiersza zlecenia (np. uwagi admina) nie jest nowością
    expect(Object.fromEntries(freshByJob(jobs, entries, scope, 'me', () => T1, false))).toEqual({ j1: 1, j3: 1 });
  });

  it('naJutroCount: dziś i jutro, niezabrane, ekipa pracownika; admin wszystkie', () => {
    const items = [
      r({ dzien: '2026-10-21', ekipa: 'A', zabrane: false }), r({ dzien: '2026-10-22', ekipa: 'A', zabrane: false }),
      r({ dzien: '2026-10-22', ekipa: 'A', zabrane: true }), r({ dzien: '2026-10-23', ekipa: 'A', zabrane: false }),
      r({ dzien: '2026-10-20', ekipa: 'A', zabrane: false }), r({ dzien: '2026-10-21', ekipa: 'B', zabrane: false }),
    ];
    expect(naJutroCount(items, '2026-10-21', { role: 'pracownik', ekipa: 'A' })).toBe(2);
    expect(naJutroCount(items, '2026-10-21', { role: 'pracownik', ekipa: null })).toBe(0);
    expect(naJutroCount(items, '2026-10-21', { role: 'admin' })).toBe(3);
    // przełom miesiąca: jutro to 1 listopada
    expect(naJutroCount([r({ dzien: '2026-11-01', ekipa: 'A', zabrane: false })], '2026-10-31', { role: 'pracownik', ekipa: 'A' })).toBe(1);
  });

  it('harmonogramCount: zmienione dni mojego wiersza od wejścia; bez wiersza 0', () => {
    const people = [r({ id: 'p1', userId: 'me' }), r({ id: 'p2', userId: 'x' })];
    const entries = [
      r({ personId: 'p1', dzien: '2026-10-22', slot: 0, updatedAt: T2 }), r({ personId: 'p1', dzien: '2026-10-22', slot: 1, updatedAt: T2 }),
      r({ personId: 'p1', dzien: '2026-10-23', updatedAt: T2 }), r({ personId: 'p1', dzien: '2026-10-24', updatedAt: T0 }),
      r({ personId: 'p2', dzien: '2026-10-22', updatedAt: T2 }),
    ];
    expect(harmonogramCount(entries, people, 'me', T1)).toBe(2);
    expect(harmonogramCount(entries, people, 'admin', T1)).toBe(0);
  });

  it('zakupyCount i badgeText', () => {
    const items = [r({ status: 'Do kupienia' }), r({ status: 'Do kupienia' }), r({ status: 'Kupione' })];
    expect(zakupyCount(items, 'Do kupienia', true)).toBe(2);
    expect(zakupyCount(items, 'Do kupienia', false)).toBe(0);
    expect([badgeText(7), badgeText(99), badgeText(100)]).toEqual(['7', '99', '99+']);
  });
});
