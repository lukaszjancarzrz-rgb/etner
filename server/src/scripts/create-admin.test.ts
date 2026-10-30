import { describe, expect, it } from 'vitest';
import { loginCookie, testDeps } from '../test-utils.js';
import { createApp } from '../app.js';
import { modules } from '../modules/index.js';
import { users } from '../core/schema-base.js';
import { bootstrapAdmin, createAdmin } from './create-admin.js';

describe('createAdmin', () => {
  it('tworzy aktywnego admina z finanse; loguje się; odrzuca zajęty login i słabe dane', async () => {
    const deps = testDeps();
    const u = await createAdmin(deps.db, { login: ' Szef ', name: 'Jan Szef', haslo: 'bardzo-tajne-1' });
    expect(u).toMatchObject({ login: 'szef', role: 'admin', perms: ['finanse'], active: true });
    expect(JSON.stringify(u)).not.toMatch(/scrypt|passwordHash/);
    expect(await loginCookie(createApp(deps, modules), 'szef', 'bardzo-tajne-1')).toMatch(/etner_s=/);
    await expect(createAdmin(deps.db, { login: 'SZEF', name: 'X', haslo: 'bardzo-tajne-1' })).rejects.toThrow(/zajęty/);
    await expect(createAdmin(deps.db, { login: 'x', name: 'X', haslo: 'bardzo-tajne-1' })).rejects.toThrow(/Login/);
    await expect(createAdmin(deps.db, { login: 'ab', name: 'X', haslo: 'krotkie' })).rejects.toThrow(/8 znaków/);
    await expect(createAdmin(deps.db, { login: 'ab', name: ' ', haslo: 'bardzo-tajne-1' })).rejects.toThrow(/imię/);
  });
});

describe('bootstrapAdmin', () => {
  it('pusta baza + ADMIN_* → admin; drugi start i baza z kontami → bez zmian; brak zmiennych → nic', async () => {
    const deps = testDeps();
    expect(await bootstrapAdmin(deps.db, {})).toBeUndefined();
    const env = { ADMIN_LOGIN: 'Szef', ADMIN_NAME: 'Jan Szef', ADMIN_PASSWORD: 'bardzo-tajne-1' };
    expect(await bootstrapAdmin(deps.db, env)).toBe('szef');
    expect(await loginCookie(createApp(deps, modules), 'szef', 'bardzo-tajne-1')).toMatch(/etner_s=/);
    expect(await bootstrapAdmin(deps.db, { ...env, ADMIN_LOGIN: 'drugi' })).toBeUndefined();
    expect(deps.db.select().from(users).all()).toHaveLength(1);
    await expect(bootstrapAdmin(testDeps().db, { ADMIN_LOGIN: 'ab', ADMIN_PASSWORD: 'krotkie' })).rejects.toThrow(/8 znaków/);
  });
});
