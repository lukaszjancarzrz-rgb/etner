// Wzorzec modułów: service.ts to funkcje z jawnym `db` jako pierwszym argumentem (np. list(db, rodzaj)); routes.ts waliduje zod i woła service; moduł eksportuje ModuleDef, a lista leży w modules/index.ts.
import type { Hono } from 'hono';
import type { User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import type { ChangeRow } from './changes.js';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

export type CronDef = { name: string; schedule: string; run(deps: AppDeps): void | Promise<void> };

export type ModuleDef = {
  name: string;
  routes(app: Hono, deps: AppDeps): void;
  /** Brak visibleTo = tylko admin (sync.ts). true = widoczne, false = ukryte, ChangeRow = wersja okrojona dla tego użytkownika. */
  visibleTo?(user: User, ch: ChangeRow, deps: AppDeps): boolean | ChangeRow;
  cron?: CronDef[];
  /** Tabele modułu (eksport). */
  tables?: Record<string, SQLiteTable>;
};

const registered = new WeakMap<Hono, ModuleDef[]>();

/** Moduły zarejestrowane w danej aplikacji (niezależnie od innych instancji). */
export const modulesOf = (app: Hono): ModuleDef[] => registered.get(app) ?? [];

export function registerModules(app: Hono, deps: AppDeps, defs: ModuleDef[]): void {
  for (const d of defs) d.routes(app, deps);
  registered.set(app, [...modulesOf(app), ...defs]);
}
