import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { costs, kpirMonths, revenues } from './schema.js';

/** Bez visibleTo: finanse widzi tylko admin (też w synchronizacji). */
export const finanse: ModuleDef = { name: 'finanse', routes, tables: { revenues, costs, kpir_months: kpirMonths } };
