import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { jobSeen, jobs, jobScopeItems, pumbleMessages } from './schema.js';
import { forWorker } from './service.js';

/** Pracownik widzi wszystkie zlecenia (bez uwag admina i leada), cały zakres prac i wiadomości Pumble. „Widziane” (job_seen): każdy tylko swoje. */
export const zlecenia: ModuleDef = {
  name: 'zlecenia',
  routes,
  tables: { jobs, job_scope_items: jobScopeItems, pumble_messages: pumbleMessages, job_seen: jobSeen },
  visibleTo(user, ch) {
    if (ch.entity === 'job_seen') return ch.after?.userId === user.id;
    if (can(user, 'admin') || ch.entity === 'job_scope_items' || ch.entity === 'pumble_messages') return true;
    return { ...ch, before: null, after: ch.after && forWorker(ch.after) };
  },
};
