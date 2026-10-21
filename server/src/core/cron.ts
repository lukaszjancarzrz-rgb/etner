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

export const rankoGodzina = (deps: AppDeps): string => {
  const v = deps.db.select().from(settings).where(eq(settings.key, 'rano_godzina')).get()?.value;
  return v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '07:00';
};

const safe = (deps: AppDeps, d: CronDef) => async () => {
  try { await d.run(deps); } catch (e) { logError(deps.db, `cron:${d.name}`, e); }
};

/** Jeden tik zadań 'rano': uruchamia je, gdy w Warszawie jest godzina z ustawień. */
export async function rankoTick(deps: AppDeps, defs: CronDef[], now = new Date()): Promise<void> {
  if (!rankoTeraz(now, rankoGodzina(deps))) return;
  for (const d of defs) await safe(deps, d)();
}

/** Planuje zadania modułów (strefa Europe/Warsaw); `schedule: 'rano'` = raz dziennie o godzinie z ustawień. Zwraca stop(). */
export function registerCron(deps: AppDeps, defs: CronDef[]): () => void {
  const tasks = defs.filter((d) => d.schedule !== 'rano')
    .map((d) => cron.schedule(d.schedule, safe(deps, d), { timezone: TZ }));
  const rano = defs.filter((d) => d.schedule === 'rano');
  if (rano.length) {
    tasks.push(cron.schedule('* * * * *', () => rankoTick(deps, rano), { timezone: TZ }));
  }
  return () => tasks.forEach((t) => t.stop());
}
