import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { clients, sites } from './schema.js';
import { clientForWorker, siteForWorker } from './service.js';

/** Pracownik: klient i obiekt tylko gdy klient ma zlecenie (deps.clientHasJobs), okrojone do pól forWorker. */
export const klienci: ModuleDef = {
  name: 'klienci',
  routes,
  tables: { clients, sites },
  visibleTo(user, ch, deps) {
    if (can(user, 'admin')) return true;
    const a = ch.after;
    if (!a) return false;
    const clientId = ch.entity === 'sites' ? (a.clientId as string) : ch.entityId;
    if (!deps.clientHasJobs?.(clientId)) return false;
    return { ...ch, before: null, after: ch.entity === 'sites' ? siteForWorker(a) : clientForWorker(a) };
  },
};
