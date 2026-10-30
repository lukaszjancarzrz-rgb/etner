import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { dict } from './schema.js';

export const slowniki: ModuleDef = { name: 'slowniki', routes, tables: { dict }, visibleTo: () => true };
