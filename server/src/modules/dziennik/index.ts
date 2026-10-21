import { eq } from 'drizzle-orm';
import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { attachments, diaryEntries } from './schema.js';
import { getEntry } from './service.js';

/** Wpis zlecenia widzi każdy, wpis leada tylko `leady`; załącznik idzie za wpisem, niepodpięte nigdy. */
export const dziennik: ModuleDef = {
  name: 'dziennik',
  routes,
  tables: { diary_entries: diaryEntries, attachments },
  visibleTo(user, ch, deps) {
    const r = (ch.after ?? ch.before) as { ownerType?: string | null; ownerId?: string | null } | null;
    if (!r?.ownerType) return false;
    if (r.ownerType === 'job') return true;
    if (r.ownerType === 'lead') return can(user, 'leady');
    if (r.ownerType === 'entry') {
      const e = r.ownerId ? (getEntry(deps.db, r.ownerId) ?? deps.db.select().from(diaryEntries).where(eq(diaryEntries.id, r.ownerId)).get()) : undefined;
      return !!e && (e.ownerType === 'job' || can(user, 'leady'));
    }
    return can(user, 'admin');
  },
};
