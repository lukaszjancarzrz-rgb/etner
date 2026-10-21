import type { ModuleDef } from '../core/registry.js';
import { slowniki } from './slowniki/index.js';
import { uzytkownicy } from './uzytkownicy/index.js';
import { klienci } from './klienci/index.js';
import { zlecenia } from './zlecenia/index.js';
import { leady } from './leady/index.js';
import { dziennik } from './dziennik/index.js';
import { naJutro } from './na-jutro/index.js';
import { zakupy } from './zakupy/index.js';
import { zadania } from './zadania/index.js';

/** Jedyne miejsce rejestracji modułów (createApp w main.ts i w testach). */
export const modules: ModuleDef[] = [slowniki, uzytkownicy, klienci, zlecenia, leady, dziennik, naJutro, zakupy, zadania];
