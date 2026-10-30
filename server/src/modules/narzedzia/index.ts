import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { tools } from './schema.js';

/** Narzędzia widzi każdy zalogowany (R40). */
export const narzedzia: ModuleDef = { name: 'narzedzia', routes, tables: { tools }, visibleTo: () => true };
