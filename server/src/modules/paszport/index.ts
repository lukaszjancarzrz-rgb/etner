import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { devices, passportFolders, passports, serviceEntries } from './schema.js';

export const paszport: ModuleDef = {
  name: 'paszport',
  routes,
  tables: { passports, passport_folders: passportFolders, devices, service_entries: serviceEntries },
};
