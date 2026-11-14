import { dayOf, newId } from '@etner/shared';
import { outbox } from '../../core/outbox.js';
import { toast } from '../../core/ui/toast.js';
import type { Rec } from '../../core/store.js';
import { createVia, updateVia } from '../../core/write.js';

const blad = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const mojeTrwajace = (s: { all(e: string): Rec[] }, userId: string) => s.all('time_entries').filter((r) => r.userId === userId && !r.do && !r.deletedAt);

/** Start (serwer sam zatrzymuje trwający wpis o tej godzinie – zmiana zlecenia to ponowny start). */
export function start(userId: string, personId: string, jobId: string | null, dzien: string): void {
  const at = new Date().toISOString();
  const id = `tmp-${newId()}`;
  void createVia('time_entries', {
    kind: 'czas-start', url: '/api/time/start', method: 'POST', body: { at, jobId },
    optimistic: (s) => { for (const r of mojeTrwajace(s, userId)) if (r.id !== id) s.put('time_entries', { ...r, do: at, doCz: at }); },
  }, { id, userId, personId, jobId, dzien, od: at, odCz: at, do: null, doCz: null, zrodlo: 'czasomierz', autoStop: false, komentarz: '' }).catch(blad('Nie rozpoczęto pracy'));
}

/** Stop: bez id, więc działa z kolejki także zanim start dotarł na serwer. `od`/`do` tylko, gdy użytkownik je poprawił. */
export function stop(userId: string, d: { od?: string; do?: string; komentarz?: string }): void {
  const at = new Date().toISOString();
  void outbox.enqueue({
    kind: 'czas-stop', url: '/api/time/stop', method: 'POST', body: { at, ...d },
    optimistic: (s) => { for (const r of mojeTrwajace(s, userId)) s.put('time_entries', { ...r, od: d.od ?? r.od, do: d.do ?? at, doCz: at, ...(d.komentarz !== undefined && { komentarz: d.komentarz }) }); },
  }).catch(blad('Nie zatrzymano czasu'));
}

export type Pola = { jobId: string | null; od: string; do: string | null; komentarz: string };
export const dodaj = (d: { jobId: string | null; od: string; do: string; komentarz: string; personId?: string }, tmp: Record<string, unknown>): Promise<unknown> =>
  createVia('time_entries', { kind: 'czas-reczny', url: '/api/time-entries', method: 'POST', body: d }, { ...tmp, zrodlo: 'reczny', autoStop: false });
/** Poprawka (też pusta = „zatwierdzone”): lokalnie od razu z autorem i czasem jak na serwerze. */
export const popraw = (id: string, body: Record<string, unknown>, meId: string): Promise<unknown> =>
  updateVia('time_entries', id, { ...body, ...(typeof body.od === 'string' && { dzien: dayOf(body.od) }), edytowal: meId, edytowalAt: new Date().toISOString() },
    { kind: 'czas-edit', url: `/api/time-entries/${id}`, method: 'PUT', body });
export const usun = (id: string): Promise<unknown> =>
  outbox.enqueue({ kind: 'czas-del', url: `/api/time-entries/${id}`, method: 'DELETE', optimistic: (s) => s.remove('time_entries', id) });
