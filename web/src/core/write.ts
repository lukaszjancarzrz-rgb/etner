import { newId } from '@etner/shared';
import { outbox, type Write } from './outbox.js';
import { store, type Rec } from './store.js';

/** Encje, w których powstają rekordy tymczasowe (`_tmp`) do czasu odpowiedzi serwera. */
const TMP_ENTITIES = ['jobs', 'diary_entries', 'attachments', 'shopping', 'schedule_drafts', 'sites', 'job_scope_items', 'leads', 'lead_contacts', 'checklists', 'tasks'];
export const tmpId = () => `tmp-${newId()}`;

/**
 * Nowy rekord przez kolejkę: od razu widoczny jako tymczasowy, po odpowiedzi zastąpiony wersją z serwera
 * (ta sama wersja przychodzi też przez SSE). `extra` = dodatkowe rekordy tymczasowe (np. miniatury zdjęć).
 */
export function createVia<T = Rec>(entity: string, w: Omit<Write, 'optimistic'>, rec: Record<string, unknown>, extra: { entity: string; rec: Rec }[] = []): Promise<T> {
  const id = (rec.id as string | undefined) ?? tmpId();
  const drop = () => { store.remove(entity, id); for (const x of extra) store.remove(x.entity, x.rec.id); };
  return outbox.enqueue({
    ...w,
    optimistic: (s) => {
      s.put(entity, { createdAt: new Date().toISOString(), ...rec, id, _tmp: true });
      for (const x of extra) s.put(x.entity, { ...x.rec, _tmp: true });
    },
  }).then((r) => {
    drop();
    const res = r as Rec | undefined;
    if (res?.id && res.createdAt && !store.get(entity, res.id)) store.put(entity, res);
    return r as T;
  });
}

/** Zmiana istniejącego rekordu: scalona od razu, cofana przy odrzuceniu. */
export function updateVia(entity: string, id: string, patch: Record<string, unknown>, w: Omit<Write, 'optimistic'>): Promise<unknown> {
  return outbox.enqueue({ ...w, optimistic: (s) => { const r = s.get(entity, id); if (r) s.put(entity, { ...r, ...patch }); } });
}

/**
 * Start aplikacji: rekordy tymczasowe z poprzedniej sesji usuwamy.
 * shortcut: zapis z kolejki wysłany po restarcie pojawi się dopiero przez synchronizację; wystarcza, bo kolejka i tak go wyśle.
 */
export function dropTmp(): void {
  for (const e of TMP_ENTITIES) for (const r of store.all(e)) if (r._tmp) store.remove(e, r.id);
}

/**
 * Rekord z serwera często przychodzi przez SSE przed odpowiedzią na zapis; do tego czasu ukrywamy
 * rekord tymczasowy, jeśli jest już prawdziwy o tych samych polach i nie starszy od niego
 * (z zapasem na różnicę zegarów). Starszy rekord o tej samej treści to inny wpis, nie echo.
 */
const SKEW_MS = 30_000; // zegar telefonu a serwera
export function withoutEchoes(recs: Rec[], fields: string[]): Rec[] {
  if (!recs.some((r) => r._tmp)) return recs;
  const sig = (r: Rec) => JSON.stringify(fields.map((f) => r[f] ?? null));
  const real = new Map<string, number[]>();
  for (const r of recs) if (!r._tmp) real.set(sig(r), [...(real.get(sig(r)) ?? []), Date.parse(r.createdAt)]);
  return recs.filter((r) => !r._tmp || !(real.get(sig(r)) ?? []).some((t) => t >= Date.parse(r.createdAt) - SKEW_MS));
}
