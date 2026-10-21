import type { Hono } from 'hono';
import type { User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import type { ChangeRow } from './changes.js';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

export type CronDef = { name: string; schedule: string; run(deps: AppDeps): void | Promise<void> };

export type ModuleDef = {
  name: string;
  routes(app: Hono, deps: AppDeps): void;
  /** true = widoczne, false = ukryte, ChangeRow = wersja okrojona dla tego użytkownika. */
  visibleTo?(user: User, ch: ChangeRow): boolean | ChangeRow;
  cron?: CronDef[];
  /** Tabele modułu (eksport). */
  tables?: Record<string, SQLiteTable>;
};

export const modules: ModuleDef[] = [];

export function registerModules(app: Hono, deps: AppDeps, defs: ModuleDef[]): void {
  for (const d of defs) {
    d.routes(app, deps);
    modules.push(d);
  }
}
