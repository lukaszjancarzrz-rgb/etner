import { ArrowLeft, CheckCircle, ClipboardText, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { addMonths } from '@etner/shared';
import { fmtDay, today, useDict, useLoading, useMe } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, useEntity, type Rec } from '../../core/store.js';
import { Empty, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, tmpId, updateVia } from '../../core/write.js';
import { fileUrl, usePicker } from '../dziennik/Diary.js';
import { dayJobIds } from '../na-jutro/model.js';
import { target } from './model.js';
import { pszHash, useCanEdit, useTeczki } from './Paszport.js';
import { cameFrom } from '../../routes.js';

const NO_JOB = '-';
const QUICK: [number, string][] = [[4, '+4 mies.'], [6, '+6 mies.'], [12, '+1 rok']];
/** Następny serwis: N miesięcy od daty wpisu, własna data albo bez zmiany terminu teczki. */
type Next = { m: number } | { d: string } | null;

/**
 * Wpis karty serwisowej (P10, P12): pełny ekran na telefonie. Nowy wpis tworzy teczkę, gdy jej nie ma, i ustawia następny serwis
 * (jeden zapis przez kolejkę offline). Edycja i usuwanie – admin albo autor.
 */
export function WpisSerwisowy({ siteId, kategoria, entryId, jobId }: { siteId: string; kategoria: string; entryId?: string; jobId?: string }) {
  const t = useTeczki(siteId).find((x) => x.kategoria === kategoria);
  const entry = useEntity('service_entries', entryId);
  const site = useEntity('sites', siteId);
  const client = useEntity('clients', site?.clientId);
  const loading = useLoading();
  const canEdit = useCanEdit();
  const back = pszHash(siteId, kategoria);

  if (!t || (entryId && !entry)) {
    return loading ? <div className="mx-auto grid max-w-2xl gap-3 p-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      : <div className="mx-auto max-w-2xl p-4"><Empty icon={ClipboardText} title={entryId ? 'Nie ma takiego wpisu' : 'Nie ma takiej teczki'} hint="Mógł zostać usunięty."><a href={back} className="font-semibold text-action">Wróć do teczki</a></Empty></div>;
  }
  if (entry && (entry._tmp || !canEdit(entry.authorId))) {
    return <div className="mx-auto max-w-2xl p-4"><Empty icon={ClipboardText} title="Tego wpisu nie edytujesz" hint={entry._tmp ? 'Wpis jeszcze się wysyła.' : 'Wpis edytuje jego autor albo administrator.'}><a href={back} className="font-semibold text-action">Wróć do teczki</a></Empty></div>;
  }
  return <Form t={t} siteId={siteId} kategoria={kategoria} entry={entry} jobId={jobId} back={back} title={[kategoria, client?.nazwa].filter(Boolean).join(' · ')} />;
}

function Form({ t, siteId, kategoria, entry, jobId, back, title }: { t: NonNullable<ReturnType<typeof useTeczki>[number]>; siteId: string; kategoria: string; entry?: Rec; jobId?: string; back: string; title: string }) {
  const me = useMe();
  const kat = useDict('kategoria').find((k) => k.wartosc === kategoria);
  const items = useDict('czynnosc_serwisowa').filter((d) => d.kategoria === kategoria).map((d) => d.wartosc as string);
  const allJobs = useEntities('jobs');
  const sched = useEntities('schedule_entries');
  const people = useEntities('schedule_people');
  const atts = useEntities('attachments');
  const jobs = useMemo(() => allJobs.filter((j) => t.jobIds.includes(j.id)).sort((a, b) => String(b.numer).localeCompare(String(a.numer), 'pl', { numeric: true })), [allJobs, t.jobIds]);
  // podpowiedź: dzisiejsze zlecenie tej osoby na tym obiekcie (harmonogram), inaczej dzisiejsze zlecenie teczki
  const todays = useMemo(() => {
    const m = new Map(jobs.map((j) => [j.id, j]));
    const mine = dayJobIds(sched, people, today(), m, (u) => u === me?.id);
    return mine[0] ?? sched.find((e) => e.dzien === today() && m.has(e.jobId))?.jobId as string | undefined;
  }, [jobs, sched, people, me?.id]);
  const had = (entry?.czynnosci as string[] | undefined) ?? [];

  const [dzien, setDzien] = useState<string>(entry?.dzien ?? today());
  const [job, setJob] = useState<string>(entry ? entry.jobId ?? NO_JOB : (jobId && t.jobIds.includes(jobId) ? jobId : todays ?? NO_JOB));
  const [done, setDone] = useState<Set<string>>(() => new Set(had.filter((c) => items.includes(c))));
  const [inne, setInne] = useState(had.filter((c) => !items.includes(c)).join(', '));
  const [uwagi, setUwagi] = useState<string>(entry?.uwagi ?? '');
  const [klient, setKlient] = useState<boolean>(entry?.dlaKlienta ?? true);
  const cykl = (t.folder ? t.folder.cyklMies : kat?.cyklMies) as number | null | undefined;
  const [next, setNext] = useState<Next>(entry ? null : cykl ? { m: cykl } : null);
  const { files, busy, previews, buttons } = usePicker({ pdf: false });
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(false);
  const nextDay = next && ('m' in next ? addMonths(dzien || today(), next.m) : next.d);
  const photos = entry ? atts.filter((a) => a.ownerType === 'service' && a.ownerId === entry.id) : [];
  const fail = (what: string) => (x: Error) => toast(what, { body: x.message, tone: 'error' });
  const toggle = (c: string) => setDone((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  // po zapisie teczka, nie formularz pod „wstecz”: z teczki – wstecz, z innego miejsca (zlecenie) – zastąpienie adresu
  const leave = () => { if (cameFrom(back)) history.back(); else location.replace(back); };
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const czynnosci = [...items.filter((c) => done.has(c)), ...inne.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dzien)) return setErr('Podaj datę serwisu');
    if (!czynnosci.length && !uwagi.trim() && !files.length && !photos.length) return setErr('Odhacz czynność, wpisz uwagi albo dodaj zdjęcie');
    const fields = { dzien, jobId: job === NO_JOB ? null : job, czynnosci, uwagi: uwagi.trim(), dlaKlienta: klient };
    const sent = files;
    const revoke = () => { for (const f of sent) URL.revokeObjectURL(f.url); };
    if (entry) {
      void updateVia('service_entries', entry.id, fields, { kind: 'paszport', url: `/api/service-entries/${entry.id}`, method: 'PUT', body: fields, files: sent.map((f) => f.file), uploadsAs: 'uploadIds' })
        .then(revoke, fail('Wpis nie został zapisany'));
    } else {
      const id = tmpId(), now = new Date().toISOString();
      const folderTmp = t.folder ? undefined : tmpId();
      const extra = sent.map((f, i) => ({ entity: 'attachments', rec: { id: `${id}-${i}`, ownerType: 'service', ownerId: id, rodzaj: 'zdjecie', nazwa: f.name, dlaKlienta: klient, _src: f.url, createdAt: now } }));
      // offline bez teczki: teczka tymczasowa z terminem (prawdziwa przychodzi z synchronizacji)
      if (folderTmp) extra.push({ entity: 'passport_folders', rec: { id: folderTmp, siteId, kategoria, nastepnySerwis: nextDay || null, cyklMies: cykl ?? null, przypomnienia: true, createdAt: now } as never });
      const f0 = t.folder;
      void createVia('service_entries', {
        kind: 'paszport', url: '/api/service-entries', method: 'POST', files: sent.map((f) => f.file), uploadsAs: 'uploadIds',
        body: { ...target(t, siteId, kategoria), ...fields, ...(nextDay && { nastepnySerwis: nextDay }) },
        optimistic: (s) => { if (f0 && nextDay) s.put('passport_folders', { ...(s.get('passport_folders', f0.id) ?? f0), nastepnySerwis: nextDay }); },
      }, { id, ...fields, folderId: t.folder?.id ?? folderTmp, siteId, kategoria, authorId: me?.id }, extra).then(revoke, fail('Wpis serwisowy nie został zapisany'));
    }
    if (!navigator.onLine) toast('Zapisane w telefonie', { body: 'Wpis wyśle się, gdy wróci zasięg.' });
    leave();
  }
  const remove = () => {
    const id = entry!.id;
    void outbox.enqueue({ kind: 'paszport', url: `/api/service-entries/${id}`, method: 'DELETE', optimistic: (s) => { s.remove('service_entries', id); for (const a of s.all('attachments')) if (a.ownerType === 'service' && a.ownerId === id) s.remove('attachments', a.id); } })
      .catch(fail('Nie usunięto wpisu'));
    leave();
  };

  return (
    <article className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-2xl gap-5 px-4 py-4 desk:py-6">
      <div className="grid gap-1">
        <a href={back} onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }} className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold text-action"><ArrowLeft className="h-5 w-5 shrink-0" />{title}</a>
        <h2 className="text-2xl font-extrabold leading-tight">{entry ? 'Edycja wpisu serwisowego' : 'Wpis serwisowy'}</h2>
      </div>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <div className="grid gap-4 rounded-2xl border border-line bg-card p-4 min-[560px]:grid-cols-2">
          <Field label="Zlecenie" hint={job !== NO_JOB && job === todays ? 'Dziś w harmonogramie' : undefined}>
            {(id, d) => <Select id={id} aria-describedby={d} value={job} onValueChange={setJob} options={[{ value: NO_JOB, label: 'bez zlecenia' }, ...jobs.map((j) => ({ value: j.id, label: `${j.numer} ${kategoria} – ${j.rodzaj ?? ''}`.trim() }))]} />}
          </Field>
          <Field label="Data">{(id) => <Input id={id} type="date" required value={dzien} onChange={(e) => setDzien(e.target.value)} />}</Field>
        </div>

        <div role="group" aria-labelledby="wpis-czynnosci" className="grid gap-1 rounded-2xl border border-line bg-card p-4">
          <p id="wpis-czynnosci" className="mb-1 text-sm font-semibold">Wykonane czynności</p>
          {!items.length && <p className="text-sm text-ink-2">Brak listy czynności dla kategorii {kategoria}. Wpisz je poniżej albo dodaj w Ustawieniach (słownik „Czynności serwisowe”).</p>}
          {items.map((c) => (
            <label key={c} className="flex min-h-12 cursor-pointer items-center gap-3 text-base">
              <Checkbox checked={done.has(c)} onCheckedChange={() => toggle(c)} />{c}
            </label>
          ))}
          <div className="mt-2"><Field label="Inne" hint="Kilka czynności oddziel przecinkiem.">{(id, d) => <Input id={id} aria-describedby={d} value={inne} onChange={(e) => setInne(e.target.value)} placeholder="Np. regulacja przepływów" />}</Field></div>
        </div>

        <Field label="Uwagi">{(id) => <Textarea id={id} value={uwagi} onChange={(e) => setUwagi(e.target.value)} placeholder="Stan filtrów, zalecenia dla klienta" />}</Field>

        <div className="grid gap-2">
          <p className="text-sm font-semibold">Zdjęcia</p>
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Zdjęcia we wpisie">
              {photos.map((a) => <li key={a.id}><img src={fileUrl(a, 'thumb')} alt={a.nazwa ?? 'Zdjęcie'} width={72} height={72} className="h-18 w-18 rounded-xl object-cover" /></li>)}
            </ul>
          )}
          {previews}
          <div className="flex flex-wrap gap-2">{buttons}</div>
        </div>

        {!entry && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Następny serwis</legend>
            <div className="grid grid-cols-3 gap-2 min-[560px]:grid-cols-[auto_auto_auto_minmax(0,1fr)]">
              {QUICK.map(([m, l]) => {
                const on = !!next && 'm' in next && next.m === m;
                return <button key={m} type="button" aria-pressed={on} onClick={() => setNext({ m })}
                  className={cn('h-12 rounded-full border px-4 font-semibold transition-colors duration-200', on ? 'border-action bg-action text-action-ink' : 'border-line bg-card hover:border-ink-2')}>{l}</button>;
              })}
              <Input type="date" aria-label="Data następnego serwisu" value={nextDay ?? ''} onChange={(e) => setNext(e.target.value ? { d: e.target.value } : null)} className="col-span-3 min-[560px]:col-span-1" />
            </div>
            <p className="text-sm text-ink-2">{nextDay ? `Termin w teczce: ${fmtDay(nextDay)}` : t.nastepnySerwis ? `Termin bez zmiany: ${fmtDay(t.nastepnySerwis)}` : 'Bez terminu następnego serwisu'}{cykl ? ` · cykl co ${cykl} mies.` : ''}</p>
          </fieldset>
        )}

        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><Checkbox checked={klient} onCheckedChange={(v) => setKlient(v === true)} />Widoczne dla klienta w paszporcie</label>
        {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
        <Button type="submit" variant="ok" className="h-14 w-full text-lg" disabled={busy}><CheckCircle className="h-6 w-6" weight="fill" />{entry ? 'Zapisz zmiany' : files.length ? 'Zapisz wpis i zdjęcia' : 'Zapisz wpis'}</Button>
        {entry && (
          <div className="flex justify-center">
            {ask ? <Button variant="danger" onClick={remove} autoFocus><Trash className="h-4 w-4" />{photos.length ? 'Usunąć wpis ze zdjęciami?' : 'Na pewno usunąć wpis?'}</Button>
              : <Button variant="ghost" className="text-danger" onClick={() => setAsk(true)}><Trash className="h-4 w-4" />Usuń wpis</Button>}
          </div>
        )}
      </form>
    </article>
  );
}
