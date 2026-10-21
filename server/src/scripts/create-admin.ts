import { loginSchema, hasloSchema } from '@etner/shared';
import type { Db } from '../core/db.js';
import { hashPassword } from '../core/password.js';
import * as uzytkownicy from '../modules/uzytkownicy/service.js';

/** Pierwszy administrator świeżej bazy: aktywny admin z uprawnieniem `finanse`. Błąd (Error z polskim komunikatem), gdy dane złe lub login zajęty. */
export async function createAdmin(db: Db, o: { login: string; name: string; haslo: string }) {
  const login = loginSchema.safeParse(o.login);
  if (!login.success) throw new Error(login.error.issues[0]!.message);
  const haslo = hasloSchema.safeParse(o.haslo);
  if (!haslo.success) throw new Error(haslo.error.issues[0]!.message);
  if (!o.name.trim()) throw new Error('Podaj imię (--name).');
  try {
    return uzytkownicy.create(db, 'cli', { login: login.data, name: o.name.trim(), role: 'admin', perms: ['finanse'], passwordHash: await hashPassword(haslo.data) });
  } catch (e) {
    throw e instanceof uzytkownicy.LoginTakenError ? new Error(`Login „${login.data}” jest już zajęty.`) : e;
  }
}
