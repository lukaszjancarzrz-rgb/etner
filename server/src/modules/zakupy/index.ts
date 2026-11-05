import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { shopping } from './schema.js';

/** Listę zakupów widzi każdy zalogowany. */
export const zakupy: ModuleDef = { name: 'zakupy', routes, tables: { shopping }, visibleTo: () => true };
