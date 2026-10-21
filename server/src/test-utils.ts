import type { AppDeps } from './app.js';
import { migrate, openDb } from './core/db.js';

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  const db = openDb(':memory:');
  migrate(db);
  return { version: 'test', db, ...over };
}
