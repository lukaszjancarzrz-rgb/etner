import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { tasks } from './schema.js';

/** Zadania widzi tylko osoba z uprawnieniem `zadania` (admin). */
export const zadania: ModuleDef = { name: 'zadania', routes, tables: { tasks }, visibleTo: (user) => can(user, 'zadania') };
