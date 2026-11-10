import { ArrowLeft, ArrowSquareOut, Bell, EnvelopeSimple, IdentificationCard, MapPin, Phone, QrCode } from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';
import { fmtDay, telHref, useLoading } from '../../core/data.js';
import { useEntities, useEntity } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia } from '../../core/write.js';
import { PaszportSekcja, pszHash, SerwisBadge, useTeczki } from './Paszport.js';

const Naklejka = lazy(() => import('./Naklejka.js'));

/** Paszport obiektu ze sklepu (offline; token z synchronizacji – R65). */
export const usePassport = (siteId: string) => useEntities('passports').find((p) => p.siteId === siteId);

export function zalozPaszport(siteId: string): void {
  void createVia('passports', { kind: 'paszport', url: '/api/passports', method: 'POST', body: { siteId } }, { siteId })
    .catch((x: Error) => toast('Nie założono paszportu', { body: x.message, tone: 'error' }));
  if (!navigator.onLine) toast('Zapisane w telefonie', { body: 'Numer paszportu nadamy, gdy wróci zasięg.' });
}

/** `#psz/<siteId>` – karta paszportu obiektu („karta nadrzędna”): numer, naklejka, kontakt, teczki, najbliższy serwis. */
export function KartaObiektu({ siteId }: { siteId: string }) {
  const site = useEntity('sites', siteId);
  const client = useEntity('clients', site?.clientId);
  const passport = usePassport(siteId);
  const teczki = useTeczki(siteId);
  const loading = useLoading();
  if (!site) {
    return loading ? <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
      : <div className="mx-auto max-w-3xl p-4"><Empty icon={IdentificationCard} title="Nie ma takiego obiektu" hint="Obiekt mógł zostać połączony z innym albo usunięty."><a href="#paszporty" className="font-semibold text-action">Paszporty</a></Empty></div>;
  }
  const next = teczki.filter((t) => t.nastepnySerwis).sort((a, b) => a.nastepnySerwis!.localeCompare(b.nastepnySerwis!))[0];
  const ready = passport && !passport._tmp;
  const klient = (client?.nazwa as string | undefined) ?? 'Klient';
  return (
    <article className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-4 desk:py-6">
      <div className="grid gap-1">
        <a href="#paszporty" className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action"><ArrowLeft className="h-5 w-5" />Wróć</a>
        <h2 className="text-2xl font-extrabold leading-tight">{klient}</h2>
        <p className="flex items-center gap-1.5 text-ink-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden />{[site.nazwa, site.adres, site.miejscowosc].filter(Boolean).join(', ') || 'Obiekt'}</p>
        {client && <a href={`#kl/${client.id}`} className="inline-flex min-h-11 items-center justify-self-start font-semibold text-action hover:underline">Karta klienta</a>}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-line bg-card px-4 py-3">
        <IdentificationCard className="h-7 w-7 shrink-0 text-ok" weight="duotone" aria-hidden />
        {passport ? (
          <p className="min-w-0 flex-1 basis-44"><span className="block text-sm text-ink-2">Numer paszportu</span>
            <span className="text-xl font-extrabold whitespace-nowrap tabular-nums">{ready ? passport.numer : 'nadamy po połączeniu'}</span></p>
        ) : <p className="min-w-0 flex-1 text-sm text-ink-2">Obiekt nie ma jeszcze paszportu. Paszport daje numer, link dla klienta i naklejkę z kodem QR.</p>}
        {!passport && <Button onClick={() => zalozPaszport(siteId)}>Załóż paszport</Button>}
        {ready && passport.token && (
          <a href={`/p/${passport.token}`} target="_blank" rel="noopener" className="inline-flex h-12 items-center gap-2 rounded-[4px] border border-line px-5 font-semibold hover:border-ink-2">
            <ArrowSquareOut className="h-5 w-5" />Podgląd klienta<span className="sr-only"> (nowa karta)</span>
          </a>
        )}
      </div>

      {next && (
        <a href={pszHash(siteId, next.kategoria)} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[4px] border border-action/40 bg-action/8 px-4 py-3 hover:border-action">
          <Bell className="h-6 w-6 shrink-0 text-action" weight="duotone" aria-hidden />
          <span className="min-w-0 flex-1"><span className="font-semibold">Najbliższy serwis: <span className="tabular-nums">{fmtDay(next.nastepnySerwis!)}</span></span>
            <span className="block text-sm text-ink-2">{next.kategoria}</span></span>
          <SerwisBadge nastepny={next.nastepnySerwis} soonOnly />
        </a>
      )}

      {client && (client.telefony?.length || client.emaile?.length) ? (
        <section aria-label="Kontakt z klientem" className="flex flex-wrap gap-2">
          {(client.telefony as string[]).map((t) => <a key={t} href={telHref(t)} className="inline-flex h-12 items-center gap-2 rounded-[4px] border border-line bg-card px-5 font-semibold hover:border-ink-2"><Phone className="h-5 w-5" />{t}</a>)}
          {((client.emaile ?? []) as string[]).map((m) => <a key={m} href={`mailto:${m}`} className="inline-flex h-12 min-w-0 items-center gap-2 rounded-[4px] border border-line px-5 font-semibold"><EnvelopeSimple className="h-5 w-5 shrink-0" /><span className="truncate">{m}</span></a>)}
        </section>
      ) : null}

      <PaszportSekcja site={site} onSite />

      <section aria-label="Kod QR i naklejka" className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[4px] border border-line bg-card p-4 min-[560px]:p-5">
        <SectionTitle>Kod QR i naklejka</SectionTitle>
        {ready ? (
          <Suspense fallback={<Skeleton className="h-48" />}>
            <Naklejka passport={passport} klient={klient} />
          </Suspense>
        ) : <p className="flex items-center gap-2 text-sm text-ink-2"><QrCode className="h-5 w-5 shrink-0" aria-hidden />{passport ? 'Naklejka będzie gotowa, gdy paszport dostanie numer (po połączeniu).' : 'Naklejkę wydrukujesz po założeniu paszportu.'}</p>}
      </section>
    </article>
  );
}
