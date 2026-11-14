import { godzinaPl, limitStopu, PRZYPOMNIENIE_MIN } from '@etner/shared';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { can } from '../../core/permissions.js';
import type { CronDef, ModuleDef } from '../../core/registry.js';
import type { AppDeps } from '../../app.js';
import { routes } from './routes.js';
import { timeEntries } from './schema.js';
import { autoStop, markReminded, runningAll } from './service.js';

/** Przypomnienie 30 min przed limitem, potem auto-stop (C3). */
export async function czasTick(deps: AppDeps, now = (deps.now ?? (() => new Date()))()): Promise<void> {
  for (const r of runningAll(deps.db)) {
    const limit = limitStopu(r.od);
    const push = (title: string, body: string) => (r.userId ? notify(deps, [r.userId], { title, body, url: '#czas', tag: `czas-${r.id}` }).catch((e) => logError(deps.db, 'push', e)) : undefined);
    if (now.getTime() >= Date.parse(limit)) {
      if (!autoStop(deps.db, r, limit)) continue;
      await push(`⏱ Czasomierz zatrzymany o ${godzinaPl(limit)}`, 'Zapomniałeś o Stop? Sprawdź godzinę zakończenia w Moich godzinach.');
    } else if (!r.przypomnianoAt && now.getTime() >= Date.parse(limit) - PRZYPOMNIENIE_MIN * 60_000) {
      markReminded(deps.db, r, now);
      await push('⏱ Czy jeszcze pracujesz?', `Czasomierz zatrzyma się sam o ${godzinaPl(limit)}. Jeśli skończyłeś – naciśnij Stop.`);
    }
  }
}

const cron: CronDef = { name: 'czasomierz', schedule: '*/5 * * * *', run: (deps) => czasTick(deps) };

/** Admin widzi wszystkie wpisy; pracownik tylko własne. */
export const czas: ModuleDef = {
  name: 'czas',
  routes,
  tables: { time_entries: timeEntries },
  visibleTo: (user, ch) => can(user, 'admin') || ((ch.after ?? ch.before) as { userId?: string } | null)?.userId === user.id,
  cron: [cron],
};
