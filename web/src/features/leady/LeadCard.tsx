import { ArrowLeft, Briefcase, Handshake, MapPin, PencilSimple, Phone } from '@phosphor-icons/react';
import { fmtZl } from '@etner/shared';
import { useEffect, useMemo, useState } from 'react';
import { fmtDay, fmtWhen, telHref, today, useDict, useLoading, useMe, useNames, useStatusGroup } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { store, useEntities, useEntity, type Rec } from '../../core/store.js';
import { Empty, SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CategoryPill, useCatColor } from '../../core/ui/category.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { tmpId, updateVia, withoutEchoes } from '../../core/write.js';
import { Diary } from '../dziennik/Diary.js';
import { siteLabel } from '../klienci/ClientPicker.js';
import { JobForm } from '../zlecenia/JobForm.js';
import { isOverdue, nextAfterContact } from './model.js';
import { LeadForm } from './LeadForm.js';

export function LeadCard({ id, highlight }: { id: string; highlight?: string }) {
  const lead = useEntity('leads', id);
  const client = useEntity('clients', lead?.clientId ?? undefined);
  const site = useEntity('sites', lead?.siteId ?? undefined);
  const jobs = useEntities('jobs');
  const loading = useLoading();
  const statusy = useDict('status_leada');
  const group = useStatusGroup('status_leada');
  const cat = useCatColor();
  const [form, setForm] = useState<null | 'edit' | 'job'>(null);
  const job = useMemo(() => jobs.find((j) => j.leadId === id), [jobs, id]);
  const jobClient = useEntity('clients', job?.clientId);
  const jobSite = useEntity('sites', job?.siteId ?? undefined);
  useEffect(() => { if (!highlight) scrollTo(0, 0); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) {
    return loading ? (
      <div className="grid gap-3 p-4 desk:p-0" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
    ) : (
      <div className="p-4 desk:p-0"><Empty icon={Handshake} title="Nie ma takiego leada" hint="Mógł zostać usunięty. Wróć do listy."><a href="#leady" className="font-semibold text-action">Lista leadów</a></Empty></div>
    );
  }
  const day = today();
  const overdue = isOverdue(lead, group(lead.status), day);
  const phones = (client?.telefony as string[] | undefined) ?? [];
  const setStatus = (status: string) => void updateVia('leads', id, { status }, { kind: 'lead', url: `/api/leads/${id}`, method: 'PUT', body: { status } })
    .catch((e: Error) => toast('Status nie został zmieniony', { body: e.message, tone: 'error' }));

  return (
    <article className="grid gap-4 px-4 py-4 desk:px-0 desk:py-0">
      <a href="#leady" className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action desk:hidden"><ArrowLeft className="h-5 w-5" />Leady</a>
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="grid gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <span className="font-semibold tabular-nums">{lead._tmp ? 'zapisywanie' : lead.numer}</span>
                {lead.kategoria && <CategoryPill name={lead.kategoria} color={cat(lead.kategoria)} />}
              </p>
              <h2 className="mt-1 font-wide text-2xl font-extrabold leading-tight">
                {client ? <a href={`#kl/${client.id}`} className="hover:text-action">{client.nazwa}</a> : 'Bez klienta'}
              </h2>
              <p className="mt-1 font-semibold">{lead.temat}</p>
              {site && <p className="mt-1 flex items-start gap-1.5 text-ink-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0" />{siteLabel(site)}</p>}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setForm('edit')} disabled={!!lead._tmp}><PencilSimple className="h-4 w-4" />Edytuj</Button>
          </div>

          {job ? (
            <a href={`#zl/${job.id}`} className="flex min-h-12 items-center gap-2 rounded-xl border border-ok/50 bg-ok/10 px-4 py-2 font-semibold hover:border-ok">
              <Briefcase className="h-5 w-5 shrink-0 text-ok" weight="fill" />
              <span className="min-w-0">Zlecenie: {[jobClient?.nazwa ?? client?.nazwa ?? 'Klient', jobSite?.miejscowosc].filter(Boolean).join(' – ')}</span>
            </a>
          ) : (
            <Button onClick={() => setForm('job')} disabled={!!lead._tmp} className="justify-self-stretch min-[560px]:justify-self-start"><Briefcase className="h-5 w-5" weight="fill" />Zrób zlecenie</Button>
          )}

          {phones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {phones.map((t) => <a key={t} href={telHref(t)} className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-5 font-semibold"><Phone className="h-5 w-5" />{t}</a>)}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm min-[560px]:grid-cols-3">
            <div className="col-span-2 min-[560px]:col-span-1">
              <dt className="text-ink-2">Status</dt>
              <dd className="mt-1"><Select aria-label="Status leada" value={lead.status} onValueChange={setStatus} options={statusy.map((s) => ({ value: s.wartosc, label: s.wartosc }))} className="h-11" /></dd>
            </div>
            <Info k="Następny kontakt">
              {lead.nastepny ? <span className={cn(overdue && 'text-danger')}>{fmtDay(lead.nastepny)}{overdue && ' (zaległy)'}</span> : 'brak'}
            </Info>
            <Info k="Ostatni kontakt">{lead.ostatni ? fmtDay(lead.ostatni) : 'brak'}</Info>
            <Info k="Wartość">{lead.wartoscGr != null ? fmtZl(lead.wartoscGr) : 'brak'}</Info>
            <Info k="Źródło">{lead.zrodlo || 'brak'}</Info>
            <Info k="Dodany">{lead.createdAt ? fmtDay(String(lead.createdAt).slice(0, 10)) : ''}</Info>
          </dl>
          {lead.opis && <div className="grid gap-1 rounded-xl bg-bg/70 p-3"><p className="text-sm font-semibold text-ink-2">Opis</p><p className="whitespace-pre-wrap">{lead.opis}</p></div>}
        </div>
      </div>

      <Contacts lead={lead} />
      <Diary ownerType="lead" ownerId={id} highlight={highlight} disabled={!!lead._tmp} />
      {form === 'edit' && <LeadForm lead={lead} onClose={() => setForm(null)} />}
      {form === 'job' && <JobForm lead={lead} onClose={() => setForm(null)} />}
    </article>
  );
}

const Info = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="min-w-0"><dt className="text-ink-2">{k}</dt><dd className="mt-0.5 font-semibold">{children}</dd></div>
);

/** „Zapisz kontakt” i historia (od najnowszego). Bez nowego terminu: zaległy jest czyszczony, przyszły zostaje (reguła serwera). */
function Contacts({ lead }: { lead: Rec }) {
  const all = useEntities('lead_contacts');
  const names = useNames();
  const me = useMe();
  const list = useMemo(() => withoutEchoes(all.filter((c) => c.leadId === lead.id), ['notatka', 'by'])
    .sort((a, b) => (a.dzien !== b.dzien ? (a.dzien < b.dzien ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)), [all, lead.id]);
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const day = today();
  const due = !!lead.nastepny && lead.nastepny <= day;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = note.trim();
    if (!n) return setErr('Wpisz notatkę z kontaktu');
    const tmp = tmpId();
    const body: Record<string, unknown> = { notatka: n, ...(next && { nastepny: next }) };
    void outbox.enqueue({
      kind: 'lead', url: `/api/leads/${lead.id}/contact`, method: 'POST', body,
      optimistic: (s) => {
        s.put('lead_contacts', { id: tmp, leadId: lead.id, dzien: day, notatka: n, nastepny: next, plan: due ? lead.nastepny : '', by: me?.id, createdAt: new Date().toISOString(), _tmp: true });
        const l = s.get('leads', lead.id);
        if (l) s.put('leads', { ...l, ostatni: day, nastepny: nextAfterContact(l.nastepny, next, day) });
      },
    }).then((r) => {
      const { lead: l, contact } = r as { lead: Rec; contact: Rec };
      store.remove('lead_contacts', tmp);
      store.put('lead_contacts', contact);
      store.put('leads', l);
    }, (x: Error) => { setNote((c) => c || n); setNext((c) => c || next); setErr(x.message); });
    setNote(''); setNext(''); setErr('');
  }

  return (
    <section aria-labelledby="kontakty" className="grid gap-3">
      <SectionTitle><span id="kontakty">Kontakty</span></SectionTitle>
      <form onSubmit={submit} noValidate className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
        <Field label="Notatka z kontaktu" error={err}>{(id, d) => <Textarea id={id} aria-describedby={d} aria-invalid={!!err} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Z kim, co ustalono" className="min-h-20" />}</Field>
        <div className="grid gap-3 min-[560px]:grid-cols-[1fr_auto] min-[560px]:items-end">
          <Field label="Następny kontakt" hint={next ? undefined : due ? 'Bez daty zaległy termin zostanie wyczyszczony.' : lead.nastepny ? `Bez daty zostaje ${fmtDay(lead.nastepny)}.` : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={next} min={day} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Button type="submit">Zapisz kontakt</Button>
        </div>
      </form>
      {!list.length ? <p className="text-sm text-ink-2">Nie było jeszcze kontaktu z klientem.</p> : (
        <ol className="grid gap-2">
          {list.map((c) => (
            <li key={c.id} className="grid gap-1 rounded-2xl border border-line bg-card px-4 py-3">
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
                <span className="font-semibold text-ink">{fmtDay(c.dzien)}</span>
                <span>{names(c.by)}{c._tmp ? ', wysyłanie…' : c.createdAt ? `, ${fmtWhen(c.createdAt).replace(/^.* /, '')}` : ''}</span>
              </p>
              <p className="whitespace-pre-wrap">{c.notatka}</p>
              {(c.plan || c.nastepny) && (
                <p className="text-sm text-ink-2">{[c.plan && `zaplanowany na ${fmtDay(c.plan)}`, c.nastepny && `następny: ${fmtDay(c.nastepny)}`].filter(Boolean).join(', ')}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
