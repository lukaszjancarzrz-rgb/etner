import { dayOf } from '@etner/shared';
import { notify } from '../../core/notify.js';
import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import * as users from '../uzytkownicy/service.js';
import { routes } from './routes.js';
import { leadContacts, leads } from './schema.js';
import { logError } from '../../core/errors.js';
import { leadyEmail, overdue, overdueMail, setSetting, setting } from './service.js';

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
  }, {
    // R38: codziennie 07:00 (Warszawa) e-mail z listą zaległych; brak zaległych = brak e-maila.
    name: 'leady-email',
    schedule: '0 7 * * *',
    async run(deps) {
      const day = dayOf((deps.now ?? (() => new Date()))());
      // najwyżej raz na dzień (np. restart serwera o 7:00); zapis przed wysyłką jak `rano_ostatnio`
      if (setting(deps.db, 'leady_email_ostatnio') === day) return;
      setSetting(deps.db, 'leady_email_ostatnio', day);
      if (!deps.mailer) return logError(deps.db, 'cron:leady-email', new Error('Brak konfiguracji SMTP (SMTP_HOST, MAIL_FROM) – e-mail o zaległych kontaktach nie wysłany'));
      const m = overdueMail(deps.db, day, deps.baseUrl);
      if (m) await deps.mailer({ ...m, to: leadyEmail(deps.db) });
    },
  }],
};
