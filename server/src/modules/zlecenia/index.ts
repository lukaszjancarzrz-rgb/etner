import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { jobs, jobScopeItems } from './schema.js';
import { forWorker } from './service.js';

/** Pracownik widzi wszystkie zlecenia (bez uwag admina i leada) i cały zakres prac. */
export const zlecenia: ModuleDef = {
  name: 'zlecenia',
  routes,
  tables: { jobs, job_scope_items: jobScopeItems },
  visibleTo(user, ch) {
    if (can(user, 'admin') || ch.entity === 'job_scope_items') return true;
    return { ...ch, before: null, after: ch.after && forWorker(ch.after) };
  },
};
