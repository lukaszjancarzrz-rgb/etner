import { describe, expect, it } from 'vitest';
import { loginCookie, testDeps } from '../test-utils.js';
import { createApp } from '../app.js';
import { modules } from '../modules/index.js';
import { createAdmin } from './create-admin.js';

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
