import { dayOf } from '@etner/shared';
import { notify } from '../../core/notify.js';
import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import * as users from '../uzytkownicy/service.js';
import { routes } from './routes.js';
import { leadContacts, leads } from './schema.js';
import { overdue } from './service.js';

/** Leady i historia kontaktów widzi tylko osoba z uprawnieniem `leady`. */
export const leady: ModuleDef = {
  name: 'leady',
  routes,
  tables: { leads, lead_contacts: leadContacts },
  visibleTo: (user) => can(user, 'leady'),
  cron: [{
    name: 'leady-przypomnienia',
    schedule: '0 7 * * *',
    async run(deps) {
      const n = overdue(deps.db, dayOf((deps.now ?? (() => new Date()))())).length;
      if (!n) return;
      await notify(deps, users.admins(deps.db), { title: `📞 Kontakt z klientem: ${n} zaległych`, body: 'Leady z terminem kontaktu na dziś lub wcześniej', url: '#leady', tag: 'leady-przypomnienia' });
    },
  }],
};
