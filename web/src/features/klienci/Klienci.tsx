import { fmtZl } from '@etner/shared';
import { ArrowLeft, Briefcase, EnvelopeSimple, MagnifyingGlass, MapPin, NavigationArrow, PencilSimple, Phone, Plus, UsersThree } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, mapsUrl, matches, telHref, useIsAdmin, useLoading } from '../../core/data.js';
import { useEntities, useEntity, type Rec } from '../../core/store.js';
import { Badge, Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Input } from '../../core/ui/input.js';
import { withoutEchoes } from '../../core/write.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import type { Route } from '../../routes.js';
import { fmtTermin } from '../zlecenia/JobCard.js';
import { ClientForm, SiteForm } from './ClientForms.js';

export function Klienci({ route }: { route: Route }) {
  return route.param ? <ClientCard id={route.param} /> : <ClientList />;
}

/** Lista klientów z wyszukiwaniem (admin; pracownik dostaje tylko klientów swoich zleceń). */
function ClientList() {
  const [q, setQ] = useState('');
  const clients = useEntities('clients');
  const sites = useEntities('sites');
  const loading = useLoading();
  const list = useMemo(() => {
    const bySite = new Map<string, string[]>();
    for (const s of sites) bySite.set(s.clientId, [...(bySite.get(s.clientId) ?? []), s.miejscowosc, s.adres]);
    return clients.filter((c) => !q || matches(q, c.nazwa, ...(c.telefony ?? []), ...(c.emaile ?? []), ...(bySite.get(c.id) ?? [])))
      .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map((c) => ({ c, place: bySite.get(c.id)?.[0] }));
  }, [clients, sites, q]);
  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  return (
    <section className="mx-auto grid max-w-3xl gap-4 px-4 py-4 desk:py-6">
      <a href="#wiecej" className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action"><ArrowLeft className="h-5 w-5" />Więcej</a>
      <label className="relative">
        <span className="sr-only">Szukaj klienta</span>
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nazwisko, telefon, miejscowość" className="pl-11" />
      </label>
      {!list.length ? <Empty icon={UsersThree} title={q ? 'Nic nie znaleziono' : 'Brak klientów'} hint={q ? 'Spróbuj samego nazwiska albo numeru telefonu.' : 'Klient powstaje razem z nowym zleceniem.'} /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {list.map(({ c, place }) => (
            <li key={c.id}>
              <a href={`#kl/${c.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-ink/4">
                <span className="min-w-0"><span className="block truncate font-semibold">{c.nazwa}</span>{place && <span className="block truncate text-sm text-ink-2">{place}</span>}</span>
                {c.telefony?.[0] && <span className="shrink-0 text-sm tabular-nums text-ink-2">{c.telefony[0]}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Karta klienta: kontakt, notatki (admin), obiekty, leady (admin), zlecenia. */
function ClientCard({ id }: { id: string }) {
  const c = useEntity('clients', id);
  const admin = useIsAdmin();
  const loading = useLoading();
  const allSites = useEntities('sites');
  const allJobs = useEntities('jobs');
  const allLeads = useEntities('leads');
  const sites = useMemo(() => withoutEchoes(allSites.filter((s) => s.clientId === id), ['nazwa', 'adres', 'miejscowosc']), [allSites, id]);
  const [form, setForm] = useState<null | { kind: 'client' } | { kind: 'site'; site?: Rec }>(null);
  const jobs = useMemo(() => allJobs.filter((j) => j.clientId === id).sort((a, b) => String(b.numer).localeCompare(String(a.numer), 'pl', { numeric: true })), [allJobs, id]);
  const leads = useMemo(() => allLeads.filter((l) => l.clientId === id), [allLeads, id]);

  if (!c) return loading ? <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-32" /></div>
    : <div className="mx-auto max-w-3xl p-4"><Empty icon={UsersThree} title="Nie ma takiego klienta" hint="Wróć do listy zleceń." /></div>;

  return (
    <article className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <a href={admin ? '#kl' : '#zl'} onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }} className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action"><ArrowLeft className="h-5 w-5" />Wróć</a>
      <div className="grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <div>
          {c.typ && <p className="text-sm text-ink-2">{c.typ === 'firma' ? 'Firma' : 'Osoba prywatna'}{c.nip ? `, NIP ${c.nip}` : ''}</p>}
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-wide text-2xl font-extrabold leading-tight">{c.nazwa}</h2>
            {admin && <Button variant="secondary" size="sm" aria-label="Edytuj klienta" onClick={() => setForm({ kind: 'client' })}><PencilSimple className="h-4 w-4" />Edytuj</Button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(c.telefony ?? []).map((t: string) => <a key={t} href={telHref(t)} className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-5 font-semibold text-action-ink"><Phone className="h-5 w-5" weight="fill" />{t}</a>)}
          {(c.emaile ?? []).map((m: string) => <a key={m} href={`mailto:${m}`} className="inline-flex h-12 min-w-0 items-center gap-2 rounded-full border border-line px-5 font-semibold"><EnvelopeSimple className="h-5 w-5 shrink-0" /><span className="truncate">{m}</span></a>)}
          {!c.telefony?.length && !c.emaile?.length && <p className="text-sm text-ink-2">Brak telefonu i e-maila.</p>}
        </div>
        {admin && c.notatki && <div className="rounded-xl bg-bg/70 p-3"><p className="text-sm font-semibold text-ink-2">Notatki</p><p className="mt-1 whitespace-pre-wrap">{c.notatki}</p></div>}
      </div>

      <div className="grid gap-2">
        <SectionTitle count={sites.length}>Obiekty</SectionTitle>
        {!sites.length ? <p className="text-sm text-ink-2">Brak obiektów.{admin ? '' : ' Adres dodaje się przy zleceniu.'}</p> : (
          <ul className="grid gap-2">
            {sites.map((s) => {
              const nav = mapsUrl(s);
              return (
                <li key={s.id} className="grid gap-3 rounded-2xl border border-line bg-card px-4 py-3 min-[560px]:flex min-[560px]:items-center min-[560px]:justify-between">
                  <span className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
                    <span className="min-w-0"><span className="block font-semibold">{s.nazwa || s.miejscowosc || 'Obiekt'}</span><span className="block text-sm text-ink-2">{[s.adres, s.miejscowosc].filter(Boolean).join(', ')}</span>{s.opis && <span className="block text-sm">{s.opis}</span>}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-2 pl-7 min-[560px]:pl-0">
                    {admin && <Button variant="ghost" size="sm" className="h-11" aria-label={`Edytuj obiekt ${s.nazwa || [s.adres, s.miejscowosc].filter(Boolean).join(', ')}`} onClick={() => setForm({ kind: 'site', site: s })}><PencilSimple className="h-4 w-4" />Edytuj</Button>}
                    {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"><NavigationArrow className="h-4 w-4" />Nawiguj</a>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {admin && <Button variant="ghost" size="sm" className="justify-self-start text-action" onClick={() => setForm({ kind: 'site' })}><Plus className="h-4 w-4" weight="bold" />Dodaj obiekt</Button>}
      </div>

      {form?.kind === 'client' && <ClientForm client={c} onClose={() => setForm(null)} />}
      {form?.kind === 'site' && <SiteForm clientId={id} site={form.site} onClose={() => setForm(null)} />}

      {admin && (
        <div className="grid gap-2">
          <SectionTitle count={leads.length}>Leady</SectionTitle>
          {!leads.length ? <p className="text-sm text-ink-2">Brak leadów tego klienta.</p> : (
            <ul className="grid gap-2">
              {leads.map((l) => (
                <li key={l.id}><a href={`#ld/${l.id}`} className="grid gap-0.5 rounded-2xl border border-line bg-card px-4 py-3 hover:border-ink-2">
                  <span className="flex items-center gap-2 text-sm text-ink-2"><Badge>{l.status}</Badge>{l.wartoscGr != null && <span className="ml-auto">{fmtZl(l.wartoscGr)}</span>}</span>
                  <span className="font-semibold">{l.temat}</span>
                  {l.nastepny && <span className="text-sm text-ink-2">Następny kontakt: {fmtDay(l.nastepny)}</span>}
                </a></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <SectionTitle count={jobs.length}>Zlecenia</SectionTitle>
        {!jobs.length ? <Empty icon={Briefcase} title="Brak zleceń" hint="Nowe zlecenie dla klienta dodasz na ekranie Zlecenia." /> : (
          <ul className="grid gap-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <a href={`#zl/${j.id}`} className="grid gap-0.5 rounded-2xl border border-line bg-card px-4 py-3 hover:border-ink-2">
                  <span className="flex items-center gap-2 text-sm text-ink-2"><span className="font-semibold tabular-nums">{j.numer}</span><Badge tone="action">{j.status}</Badge><span className="ml-auto capitalize">{fmtTermin(j.termin)}</span></span>
                  <span className="line-clamp-2">{[j.rodzaj, j.kategoria].filter(Boolean).join(', ')}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
