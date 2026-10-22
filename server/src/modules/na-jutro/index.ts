import { dayOf } from '@etner/shared';
import { notify } from '../../core/notify.js';
import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import * as users from '../uzytkownicy/service.js';
import { routes } from './routes.js';
import { checklists } from './schema.js';
import { pending } from './service.js';

/** Listę widzi tylko ekipa (user.ekipa === ekipa listy) i admin; przeniesienie: stara ekipa dostaje tylko usunięcie. */
export const naJutro: ModuleDef = {
  name: 'na-jutro',
  routes,
  tables: { checklists },
  visibleTo(user, ch) {
    if (can(user, 'admin')) return true;
    const [b, a] = [ch.before, ch.after].map((r) => (r as { ekipa?: string } | null)?.ekipa);
    if (!user.ekipa) return false;
    if (a === user.ekipa) return true;
    // Przeniesienie do innej ekipy: stara ekipa dostaje tylko polecenie usunięcia, bez nowej treści.
    return b === user.ekipa ? { ...ch, action: 'delete', after: { id: ch.entityId, ekipa: b, deletedAt: ch.at } } : false;
  },
  // o godzinie „rano” (ustawienia, domyślnie 07:00): każdy z ekipy, która ma niezabrane rzeczy na dziś
  cron: [{
    name: 'na-jutro-rano',
    schedule: 'rano',
    async run(deps) {
      const byEkipa = new Map<string, string[]>();
      for (const r of pending(deps.db, dayOf((deps.now ?? (() => new Date()))()))) byEkipa.set(r.ekipa, [...(byEkipa.get(r.ekipa) ?? []), r.tekst]);
      for (const [ekipa, list] of byEkipa) {
        const body = list.length > 3 ? `${list.slice(0, 3).join(', ')} i ${list.length - 3} więcej` : list.join(', ');
        await notify(deps, users.crewMembers(deps.db, ekipa), { title: `📦 Do zabrania dziś: ${list.length}`, body, url: '#jutro', tag: `jutro-rano-${ekipa}` });
      }
    },
  }],
};
