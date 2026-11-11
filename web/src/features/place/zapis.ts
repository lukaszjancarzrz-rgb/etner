import { outbox } from '../../core/outbox.js';
import { store, type Rec } from '../../core/store.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';

export const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });

/** Godziny i/lub koszt umowy osoby w miesiącu (PUT upsert; oba null = wyczyszczenie). */
export function zapiszMiesiac(personId: string, miesiac: string, patch: { godziny?: number | null; kosztUmowyGr?: number | null }): void {
  // wiersz dodany bez sieci (_tmp) też się liczy – inaczej drugi zapis wysłałby null w miejsce wpisanych godzin
  const rows = store.all('payroll_months').filter((r) => !r.deletedAt && r.personId === personId && r.miesiac === miesiac);
  const cur = rows.find((r) => !r._tmp) ?? rows[0];
  const body = { godziny: (cur?.godziny as number | null | undefined) ?? null, kosztUmowyGr: (cur?.kosztUmowyGr as number | null | undefined) ?? null, ...patch };
  const w = { kind: 'płace: godziny', url: `/api/payroll/months/${personId}/${miesiac}`, method: 'PUT' as const, body };
  void (cur ? updateVia('payroll_months', cur.id, body, w) : createVia('payroll_months', w, { personId, miesiac, ...body })).catch(fail('Nie zapisano'));
}

/** Zapis rekordu płac: nowy przez createVia, istniejący przez updateVia (wspólne dla osób, stawek i wpisów). */
export const zapisz = (entity: string, cur: Rec | undefined, w: { kind: string; url: string; method: 'POST' | 'PUT'; body: Record<string, unknown> }, nowy: Record<string, unknown>) =>
  (cur ? updateVia(entity, cur.id, w.body, w) : createVia(entity, w, nowy)).catch(fail('Nie zapisano'));

/** Usunięcie rekordu przez kolejkę (z natychmiastowym zniknięciem z listy). */
export const usun = (entity: string, id: string, url: string) =>
  void outbox.enqueue({ kind: 'płace: usunięcie', url, method: 'DELETE', optimistic: (s) => s.remove(entity, id) }).catch(fail('Nie usunięto'));
