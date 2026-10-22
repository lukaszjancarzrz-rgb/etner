import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { newId, type User } from '@etner/shared';
import type { AppDeps } from './app.js';
import { hashPassword } from './core/password.js';
import { diskStore } from './core/files.js';
import { migrate, openDb } from './core/db.js';
import { users } from './core/schema-base.js';

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  const db = openDb(':memory:');
  migrate(db);
  const secret = 'test-secret';
  return { version: 'test', db, secret, files: diskStore(mkdtempSync(join(tmpdir(), 'etner-files-')), secret),
    push: async () => ({ statusCode: 201 }), ...over };
}

export const TEST_PASSWORD = 'haslo-testowe-1';
const TEST_HASH = await hashPassword(TEST_PASSWORD);
let seq = 0;

/** Tworzy użytkownika ze znanym loginem i hasłem (TEST_PASSWORD). */
export function addUser(
  deps: AppDeps,
  o: Partial<Pick<User, 'name' | 'role' | 'perms' | 'ekipa' | 'scheduleCol' | 'active' | 'email'>> = {},
): { user: User; login: string; haslo: string } {
  const login = `u${++seq}`;
  const now = new Date().toISOString();
  const user: User = { id: newId(), name: 'Jan', role: 'pracownik', perms: [], ekipa: null, scheduleCol: null, active: true, ...o };
  deps.db.insert(users).values({ ...user, login, passwordHash: TEST_HASH, createdAt: now, updatedAt: now }).run();
  return { user, login, haslo: TEST_PASSWORD };
}

/** Loguje loginem (hasło testowe) i zwraca nagłówek Cookie do kolejnych zapytań. */
export async function loginCookie(app: Hono, login: string, haslo = TEST_PASSWORD): Promise<string> {
  const res = await app.request('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, haslo }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}
