import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { jobs } from './schema.js';
import { forWorker } from './service.js';

/** Pracownik widzi wszystkie zlecenia, ale bez uwag admina i leada. */
export const zlecenia: ModuleDef = {
  name: 'zlecenia',
  routes,
  tables: { jobs },
  visibleTo(user, ch) {
    if (can(user, 'admin')) return true;
    return { ...ch, before: null, after: ch.after && forWorker(ch.after) };
  },
};
