import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { tools, toolService } from './schema.js';

/** Narzędzia i ich historię serwisową widzi każdy zalogowany (R40). */
export const narzedzia: ModuleDef = { name: 'narzedzia', routes, tables: { tools, tool_service: toolService }, visibleTo: () => true };
