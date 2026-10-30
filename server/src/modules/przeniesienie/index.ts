import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { migrationReview } from './schema.js';

/** Lista „do przejrzenia” po przeniesieniu danych; bez visibleTo = tylko admin (także w synchronizacji). */
export const przeniesienie: ModuleDef = { name: 'przeniesienie', routes, tables: { migration_review: migrationReview } };
