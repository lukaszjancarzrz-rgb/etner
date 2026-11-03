import { eq } from 'drizzle-orm';
import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { attachments, diaryEntries } from './schema.js';
import { getEntry } from './service.js';

/** Wpis zlecenia i zdjęcie zakresu prac widzi każdy, wpis leada tylko `leady`; załącznik idzie za wpisem, niepodpięte nigdy, faktury tylko admin. */
export const dziennik: ModuleDef = {
  name: 'dziennik',
  routes,
  tables: { diary_entries: diaryEntries, attachments },
  visibleTo(user, ch, deps) {
    const r = (ch.after ?? ch.before) as { ownerType?: string | null; ownerId?: string | null; typDok?: string | null } | null;
    if (!r?.ownerType) return false;
    // faktury tylko admin (P6); plik oznaczony fakturą po fakcie znika z telefonu pracownika
    if (r.typDok === 'faktura' && !can(user, 'admin')) return ch.action === 'update' ? { ...ch, action: 'delete', after: null } : false;
    if (r.ownerType === 'teczka' || r.ownerType === 'device' || r.ownerType === 'service') return true; // pliki paszportu widzi każdy, jak teczkę
    if (r.ownerType === 'job' || r.ownerType === 'scope') return true; // scope: zdjęcie punktu zakresu, widoczne jak zlecenie
    if (r.ownerType === 'lead') return can(user, 'leady');
    if (r.ownerType === 'entry') {
      const e = r.ownerId ? (getEntry(deps.db, r.ownerId) ?? deps.db.select().from(diaryEntries).where(eq(diaryEntries.id, r.ownerId)).get()) : undefined;
      return !!e && (e.ownerType === 'job' || can(user, 'leady'));
    }
    return can(user, 'admin');
  },
};
