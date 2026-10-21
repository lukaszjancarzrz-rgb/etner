import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { jobs, jobScopeItems, pumbleMessages } from './schema.js';
import { forWorker } from './service.js';

/** Pracownik widzi wszystkie zlecenia (bez uwag admina i leada), cały zakres prac i wiadomości Pumble. */
export const zlecenia: ModuleDef = {
  name: 'zlecenia',
  routes,
  tables: { jobs, job_scope_items: jobScopeItems, pumble_messages: pumbleMessages },
  visibleTo(user, ch) {
    if (can(user, 'admin') || ch.entity === 'job_scope_items' || ch.entity === 'pumble_messages') return true;
    return { ...ch, before: null, after: ch.after && forWorker(ch.after) };
  },
};
