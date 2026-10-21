import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import { logError } from './errors.js';
import type { CronDef } from './registry.js';
import { settings } from './schema-base.js';

const TZ = 'Europe/Warsaw';
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Czy w Warszawie jest teraz godzina z ustawienia (HH:MM). */
export const rankoTeraz = (now: Date, godzina: string): boolean => hm.format(now) === godzina;

export const rankoGodzina = (deps: AppDeps): string =>
  deps.db.select().from(settings).where(eq(settings.key, 'rano_godzina')).get()?.value ?? '07:00';

/** Planuje zadania modułów (strefa Europe/Warsaw); `schedule: 'rano'` = raz dziennie o godzinie z ustawień. Zwraca stop(). */
export function registerCron(deps: AppDeps, defs: CronDef[]): () => void {
  const safe = (d: CronDef) => async () => {
    try { await d.run(deps); } catch (e) { logError(deps.db, `cron:${d.name}`, e); }
  };
  const tasks = defs.filter((d) => d.schedule !== 'rano')
    .map((d) => cron.schedule(d.schedule, safe(d), { timezone: TZ }));
  const rano = defs.filter((d) => d.schedule === 'rano');
  if (rano.length) {
    tasks.push(cron.schedule('* * * * *', async () => {
      if (!rankoTeraz(new Date(), rankoGodzina(deps))) return;
      for (const d of rano) await safe(d)();
    }, { timezone: TZ }));
  }
  return () => tasks.forEach((t) => t.stop());
}
