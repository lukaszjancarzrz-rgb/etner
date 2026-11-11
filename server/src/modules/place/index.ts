import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { payrollEntries, payrollMonths, payrollPeople, payrollRates } from './schema.js';

/** Bez visibleTo: Płace widzi tylko admin (też w synchronizacji). */
export const place: ModuleDef = { name: 'place', routes, tables: { payroll_people: payrollPeople, payroll_rates: payrollRates, payroll_months: payrollMonths, payroll_entries: payrollEntries } };
