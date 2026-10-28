import { describe, expect, it } from 'vitest';
import { autaCount, badgeText, changedDays, freshByJob, naJutroCount, staleDayKeys, ViewedDays, unseenDays, zakupyCount } from './badges.js';

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
    // Pumble: cudze wiadomości po wizycie; własne (wysłane z ETNER) i stare nie
    const pb = [r({ jobId: 'j3', createdBy: null, createdAt: T2 }), r({ jobId: 'j3', createdBy: 'me', createdAt: T2 }), r({ jobId: 'j2', createdBy: 'w', createdAt: T0 })];
    expect(Object.fromEntries(freshByJob([], [], [], 'me', () => T1, false, pb))).toEqual({ j3: 1 });
  });

  it('naJutroCount: tylko następny dzień roboczy, niezabrane, ekipa pracownika; admin wszystkie', () => {
    const items = [
      r({ dzien: '2026-10-21', ekipa: 'A', zabrane: false }), r({ dzien: '2026-10-22', ekipa: 'A', zabrane: false }),
      r({ dzien: '2026-10-22', ekipa: 'A', zabrane: true }), r({ dzien: '2026-10-23', ekipa: 'A', zabrane: false }),
      r({ dzien: '2026-10-20', ekipa: 'A', zabrane: false }), r({ dzien: '2026-10-21', ekipa: 'B', zabrane: false }),
    ];
    expect(naJutroCount(items, '2026-10-21', { role: 'pracownik', ekipa: 'A' })).toBe(1);
    expect(naJutroCount(items, '2026-10-21', { role: 'pracownik', ekipa: null })).toBe(0);
    expect(naJutroCount(items, '2026-10-21', { role: 'admin' })).toBe(1);
    expect(naJutroCount([...items, r({ dzien: '2026-10-22', ekipa: 'B', zabrane: false })], '2026-10-21', { role: 'admin' })).toBe(2);
    // przełom miesiąca: jutro to 1 grudnia
    expect(naJutroCount([r({ dzien: '2026-12-01', ekipa: 'A', zabrane: false })], '2026-11-30', { role: 'pracownik', ekipa: 'A' })).toBe(1);
    // piątek: liczy poniedziałek, nie sobotę; dodatkowy dzień wolny przesuwa dalej
    const mon = [r({ dzien: '2026-10-24', ekipa: 'A', zabrane: false }), r({ dzien: '2026-10-26', ekipa: 'A', zabrane: false })];
    expect(naJutroCount(mon, '2026-10-23', { role: 'admin' })).toBe(1);
    expect(naJutroCount(mon, '2026-10-23', { role: 'admin' }, ['2026-10-26'])).toBe(0);
  });

  it('changedDays i unseenDays: mój wiersz (admin bez wiersza: wszyscy), bez własnych zmian; dzień widziany po zmianie znika', () => {
    const people = [r({ id: 'p1', userId: 'me' }), r({ id: 'p2', userId: 'x' })];
    const entries = [
      r({ personId: 'p1', dzien: '2026-10-22', slot: 0, updatedAt: T1 }), r({ personId: 'p1', dzien: '2026-10-22', slot: 1, updatedAt: T2 }),
      r({ personId: 'p1', dzien: '2026-10-23', updatedAt: T2 }), r({ personId: 'p1', dzien: '2026-10-24', updatedAt: T0 }),
      r({ personId: 'p2', dzien: '2026-10-25', updatedAt: T2 }), r({ personId: 'p2', dzien: '2026-10-26', updatedAt: T2, createdBy: 'adm' }),
      r({ personId: 'p1', dzien: '2026-10-27', updatedAt: T2, _tmp: true }),
    ];
    const w = changedDays(entries, people, { id: 'me', role: 'pracownik' });
    expect(Object.fromEntries(w)).toEqual({ '2026-10-22': T2, '2026-10-23': T2, '2026-10-24': T0 });
    expect(changedDays(entries, people, { id: 'x2', role: 'pracownik' }).size).toBe(0);
    expect([...changedDays(entries, people, { id: 'me', role: 'pracownik' }, '2026-10-23').keys()]).toEqual(['2026-10-23', '2026-10-24']);
    // admin bez wiersza: zmiany wszystkich oprócz własnych
    expect([...changedDays(entries, people, { id: 'adm', role: 'admin' }).keys()].sort()).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    const seen: Record<string, string> = { '2026-10-22': T1 };
    expect(unseenDays(w, (d) => seen[d] ?? T1)).toEqual(['2026-10-22', '2026-10-23']);
    seen['2026-10-22'] = T2; // dzień obejrzany po zmianie
    expect(unseenDays(w, (d) => seen[d] ?? T1)).toEqual(['2026-10-23']);
  });

  it('staleDayKeys: tylko obejrzane dni sprzed granicy', () => {
    expect(staleDayKeys(['harm-day:u:2026-08-01', 'harm-day:u:2026-08-22', 'seen:j1', 'nav-seen:u:harm'], '2026-08-22')).toEqual(['harm-day:u:2026-08-01']);
  });

  it('zakupyCount i badgeText', () => {
    const items = [r({ status: 'Do kupienia' }), r({ status: 'Do kupienia' }), r({ status: 'Kupione' })];
    expect(zakupyCount(items, 'Do kupienia', true)).toBe(2);
    expect(zakupyCount(items, 'Do kupienia', false)).toBe(0);
    expect([badgeText(7), badgeText(99), badgeText(100)]).toEqual(['7', '99', '99+']);
  });

  it('autaCount: tylko usterki bez dnia naprawy i bez „Naprawione”', () => {
    expect(autaCount([r({ naprawaDzien: null }), r({}), r({ naprawaDzien: '2026-11-03' }), r({ naprawaDzien: null, naprawioneAt: T1 })])).toBe(2);
  });
});

describe('ViewedDays (widziane przy wyjściu)', () => {
  it('nic nie zapisuje przed flush, potem każdy dzień raz z czasem ostatniego obejrzenia', () => {
    const v = new ViewedDays();
    const marked: [string, string][] = [];
    v.add('2026-08-12', T0); v.add('2026-08-10', T0); v.add('2026-08-12', T1);
    expect(marked).toEqual([]);
    expect(v.flush((d, at) => marked.push([d, at]))).toEqual(['2026-08-10', '2026-08-12']);
    expect(marked).toEqual([['2026-08-10', T0], ['2026-08-12', T1]]);
    expect(v.flush((d, at) => marked.push([d, at]))).toEqual([]);
    expect(marked).toHaveLength(2);
  });
  it('zmiana po obejrzeniu zostaje nowa, dotknięty dzień nie jest zapisywany drugi raz', () => {
    const v = new ViewedDays();
    const seen = new Map<string, string>();
    v.add('2026-08-10', T0); v.add('2026-08-11', T0);
    v.delete('2026-08-11');
    v.flush((d, at) => seen.set(d, at));
    const changed = new Map([['2026-08-10', T1], ['2026-08-11', T1]]);
    expect(unseenDays(changed, (d) => seen.get(d) ?? T0)).toEqual(['2026-08-10', '2026-08-11']);
    expect(seen.has('2026-08-11')).toBe(false);
  });
});
