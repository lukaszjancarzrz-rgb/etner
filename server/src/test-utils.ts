import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { newId, type User } from '@etner/shared';
import type { AppDeps } from './app.js';
import { hashToken } from './core/auth.js';
import { diskStore } from './core/files.js';
import { migrate, openDb } from './core/db.js';
import { users } from './core/schema-base.js';

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  const db = openDb(':memory:');
  migrate(db);
  const secret = 'test-secret';
  return { version: 'test', db, secret, files: diskStore(mkdtempSync(join(tmpdir(), 'etner-files-')), secret), ...over };
}

/** Tworzy użytkownika ze znanym tokenem linku logowania. */
export function addUser(
  deps: AppDeps,
  o: Partial<Pick<User, 'name' | 'role' | 'perms' | 'ekipa' | 'scheduleCol' | 'active'>> = {},
): { user: User; token: string } {
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const user: User = { id: newId(), name: 'Jan', role: 'pracownik', perms: [], ekipa: null, scheduleCol: null, active: true, ...o };
  deps.db.insert(users).values({ ...user, tokenHash: hashToken(token), createdAt: now, updatedAt: now }).run();
  return { user, token };
}

/** Loguje tokenem i zwraca nagłówek Cookie do kolejnych zapytań. */
export async function loginCookie(app: Hono, token: string): Promise<string> {
  const res = await app.request('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}
