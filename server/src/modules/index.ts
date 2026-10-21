import type { ModuleDef } from '../core/registry.js';
import { slowniki } from './slowniki/index.js';
import { uzytkownicy } from './uzytkownicy/index.js';

/** Jedyne miejsce rejestracji modułów (createApp w main.ts i w testach). */
export const modules: ModuleDef[] = [slowniki, uzytkownicy];
