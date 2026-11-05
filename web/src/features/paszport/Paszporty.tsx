import { CaretRight, IdentificationCard, MapPin } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { matches, seenFor, useDict, useLoading, useMe, useSeenVersion } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty } from '../../core/ui/bits.js';
import { catStripe, useCatColor } from '../../core/ui/category.js';
import { Search } from '../../core/ui/search.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { withoutEchoes } from '../../core/write.js';
import { freshIn, indeks, seenKey, sortPaszporty, teczkiObiektu, type Teczka } from './model.js';
import { pszHash, SerwisBadge, siteHash } from './Paszport.js';

type Wiersz = { site: Rec; klient: string; numer?: string; teczki: (Teczka & { nowe: number })[]; termin?: string };

/** Zakładka „Paszporty”: obiekty z teczkami (jak sekcja na karcie klienta), wyszukiwanie, klik w obiekt → karta paszportu, w teczkę → teczka. Działa offline (dane ze sklepu). */
export function Paszporty() {
  const [q, setQ] = useState('');
  const loading = useLoading();
  const sites = useEntities('sites');
  const clients = useEntities('clients');
  const passports = useEntities('passports');
  const jobs = useEntities('jobs');
  const folders = useEntities('passport_folders');
  const diary = useEntities('diary_entries');
  const scope = useEntities('job_scope_items');
  const attachments = useEntities('attachments');
  const devices = useEntities('devices');
  const service = useEntities('service_entries');
  const kat = useDict('kategoria');
  const cat = useCatColor();
  const me = useMe();
  const ver = useSeenVersion();

  const rows = useMemo((): Wiersz[] => {
    const d = { jobs, folders, diary, scope, attachments: withoutEchoes(attachments, ['nazwa', 'rodzaj']), devices, service };
    const order = kat.map((k) => k.wartosc as string);
    const klient = new Map(clients.map((c) => [c.id, c.nazwa as string]));
    const numer = new Map(passports.map((p) => [p.siteId, p.numer as string]));
    const seen = me ? seenFor(me.id) : undefined;
    const idx = indeks(d); // raz dla wszystkich obiektów
    return sites.filter((s) => !s._tmp && (idx.jobs.has(s.id) || idx.folders.has(s.id))).map((site) => {
      const teczki = teczkiObiektu(site.id, d, order, idx).map((t) => ({ ...t, nowe: me ? freshIn(t, seen!(seenKey(site.id, t.kategoria)), me.id).size : 0 }));
      const termin = teczki.map((t) => t.nastepnySerwis).filter((x): x is string => !!x).sort()[0];
      return { site, klient: klient.get(site.clientId) ?? '', numer: numer.get(site.id), teczki, ...(termin && { termin }) };
    }).filter((r) => r.teczki.length);
  }, [sites, clients, passports, jobs, folders, diary, scope, attachments, devices, service, kat, me, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => sortPaszporty(rows.filter((r) => !q || matches(q, r.klient, r.site.nazwa, r.site.adres, r.site.miejscowosc, r.numer, ...r.teczki.map((t) => t.kategoria)))), [rows, q]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  return (
    <section className="mx-auto grid max-w-3xl gap-4 px-4 py-4 desk:py-6" aria-label="Paszporty">
      <Search value={q} onChange={setQ} label="Szukaj paszportu" placeholder="Klient, miejscowość, adres, PSZ, kategoria" />
      {!list.length ? <Empty icon={IdentificationCard} title={q ? 'Nic nie znaleziono' : 'Brak teczek'} hint={q ? 'Spróbuj samego nazwiska albo miejscowości.' : 'Teczka obiektu powstaje z pierwszym zleceniem z kategorią.'} /> : (
        <ul className="grid gap-3">
          {list.map((r) => {
            const where = [r.site.nazwa, r.site.adres].filter(Boolean).join(', ');
            return (
              <li key={r.site.id} className="overflow-hidden rounded-2xl border border-line bg-card">
                <a href={siteHash(r.site.id)} className="flex min-h-16 items-start justify-between gap-3 px-4 pt-3 pb-2 hover:bg-ink/4">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-extrabold leading-tight">{r.klient || 'Klient'}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{[r.site.miejscowosc, where].filter(Boolean).join(' · ') || 'Obiekt'}</span></span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.numer && <span className="text-sm font-semibold tabular-nums text-ink-2">{r.numer}</span>}
                    <CaretRight className="h-5 w-5 text-ink-2" aria-hidden />
                  </span>
                </a>
                <ul className="flex flex-wrap gap-2 px-4 pb-3" aria-label="Teczki">
                  {r.teczki.map((t) => (
                    <li key={t.kategoria}>
                      <a href={pszHash(r.site.id, t.kategoria)} className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold hover:border-ink-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catStripe(cat(t.kategoria)) }} aria-hidden />
                        {t.kategoria}
                        <SerwisBadge nastepny={t.nastepnySerwis} />
                        {!!t.nowe && <Badge tone="new"><span aria-hidden>{t.nowe} nowe</span><span className="sr-only">, nowe od ostatniej wizyty: {t.nowe}</span></Badge>}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
