import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { schedulePeople, users } from './schema.js';
import { strip } from './service.js';

/** Admin widzi wszystkich, pozostali tylko siebie; token_hash jest wycinany także tutaj (druga bariera). */
export const uzytkownicy: ModuleDef = {
  name: 'uzytkownicy',
  routes,
  tables: { users, schedule_people: schedulePeople },
  visibleTo(user, ch) {
    if (ch.entity !== 'users') return true;
    const own = ch.entityId === user.id;
    if (user.role !== 'admin' && !own) return false;
    return { ...ch, before: ch.before && strip(ch.before), after: ch.after && strip(ch.after) };
  },
};
