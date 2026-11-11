import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { warehouseItems } from './schema.js';
import { purgeTaken } from './service.js';

/** Nietypowe rzeczy na magazynie widzi każdy (R40); raz dziennie (Europe/Warsaw) znikają rzeczy zabrane ponad 7 dni temu. */
export const magazyn: ModuleDef = {
  name: 'magazyn',
  routes,
  tables: { warehouse_items: warehouseItems },
  visibleTo: () => true,
  cron: [{ name: 'magazyn-zabrane', schedule: '20 3 * * *', run: (deps) => { purgeTaken(deps.db, (deps.now ?? (() => new Date()))()); } }],
};
