import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { carFaults, cars } from './schema.js';

/** Samochody i usterki widzi każdy zalogowany (R40). */
export const samochody: ModuleDef = { name: 'samochody', routes, tables: { cars, car_faults: carFaults }, visibleTo: () => true };
