import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { devices, passportFolders, passports, serviceEntries } from './schema.js';
import { folderForWorker, sendReminders } from './service.js';

/** Paszporty (z tokenem, R65), teczki, urządzenia i karty serwisowe widzi każdy; notatkę z rozliczeniem tylko admin (P6). */
export const paszport: ModuleDef = {
  name: 'paszport',
  routes,
  tables: { passports, passport_folders: passportFolders, devices, service_entries: serviceEntries },
  visibleTo(user, ch) {
    if (ch.entity !== 'passport_folders' || can(user, 'admin')) return true;
    return { ...ch, before: null, after: ch.after && folderForWorker(ch.after) };
  },
  // P13: e-mail do klienta 30 i 7 dni przed serwisem
  cron: [{ name: 'paszport-przypomnienia', schedule: '0 7 * * *', run: async (deps) => { await sendReminders(deps); } }],
};
