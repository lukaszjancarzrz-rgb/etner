import { fmtZl, rozbij, type Sposob } from '@etner/shared';
import { api } from '../../core/api.js';
import { today } from '../../core/data.js';
import { store, type Rec } from '../../core/store.js';
import { toast } from '../../core/ui/toast.js';
import { createVia } from '../../core/write.js';
import { openRevenue } from './RevenueForm.js';

// shortcut: dopasowanie po nazwie wartości słownika (jak jobStatusFromLead); po zmianie nazwy statusu przestaje działać – przejść na flagę w słowniku
const rozliczone = (s: string) => s.trim().toLowerCase() === 'rozliczone';

/** Po zapisie zlecenia ze zmianą statusu na „Rozliczone” (i bez przychodu): przychód od razu (ustawienie + kwota z leada) albo okienko z podpowiedzią. */
export async function przychodPoRozliczeniu(job: Rec, nowyStatus: string): Promise<void> {
  if (!rozliczone(nowyStatus) || rozliczone(String(job.status ?? ''))) return;
  if (store.all('revenues').some((r) => r.jobId === job.id && !r.deletedAt)) return;
  const lead = store.get('leads', job.leadId);
  const kwotaGr = (lead?.wartoscGr as number | null | undefined) || undefined;
  const prefill: Partial<Rec> = {
    jobId: job.id, kategoria: job.kategoria, klient: store.get('clients', job.clientId)?.nazwa ?? '', miejscowosc: store.get('sites', job.siteId)?.miejscowosc ?? '',
    opis: `${job.rodzaj ?? ''} ${job.kategoria ?? ''}`.trim(), kwotaGr,
  };
  const dialog = () => openRevenue({ prefill, fromJob: true });
  if (!kwotaGr) return dialog();
  let s: { autoPrzychod: boolean; domyslnySposob: Sposob };
  try { s = await api('/api/settings/finanse'); } catch { return dialog(); }
  if (!s.autoPrzychod) return dialog();
  const dzien = today();
  const body = { jobId: job.id, kategoria: job.kategoria || null, klient: prefill.klient, miejscowosc: prefill.miejscowosc, opis: prefill.opis, sposob: s.domyslnySposob, kwotaGr, dzien, innyMiesiac: null, nrFaktury: '', materialyGr: null, uwagi: '' };
  try {
    const r = await createVia<Rec>('revenues', { kind: 'przychod', url: '/api/revenues', method: 'POST', body }, { ...body, ...rozbij(kwotaGr, s.domyslnySposob), miesiac: dzien.slice(0, 7) });
    toast(`Dodano przychód ${fmtZl(kwotaGr)}`, { tone: 'ok', action: { label: 'Popraw', onClick: () => openRevenue({ revenue: store.get('revenues', r.id) ?? r }) } });
  } catch (x) { toast('Przychód nie został zapisany', { body: (x as Error).message, tone: 'error' }); }
}
