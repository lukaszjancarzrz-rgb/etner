import { ArrowLeft, Bell, Briefcase, ClipboardText, Cpu, Eye, FilePdf, FileText, FolderSimplePlus, Images, Notepad, PencilSimple, Plus, Receipt, Trash, UploadSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { addMonths } from '@etner/shared';
import { fmtDay, markSeen, seenFor, today, useDict, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, useEntity, type Rec } from '../../core/store.js';
import { Badge, Empty, NewMark, SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { catStripe, useCatColor } from '../../core/ui/category.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';
import type { Route } from '../../routes.js';
import { KlientToggle, fileUrl, usePicker } from '../dziennik/Diary.js';
import { Viewer } from '../dziennik/Viewer.js';
import { fmtTermin } from '../zlecenia/JobCard.js';
import { TYP_LABEL, freshIn, plural, seenKey, target, typOptions, type Plik, type Teczka as T } from './model.js';
import { AddFolder, SerwisBadge, pszHash, useCanEdit, useTeczki } from './Paszport.js';
import { DeviceForm } from './Urzadzenie.js';
import { WpisSerwisowy } from './WpisSerwisowy.js';

const fail = (what: string) => (x: Error) => toast(what, { body: x.message, tone: 'error' });

/** `#psz/<siteId>/<kategoria>` – teczka; `/wpis` – nowy wpis serwisowy, `/wpis/<id>` – edycja. */
export function Teczka({ route }: { route: Route }) {
  const [siteId = '', kategoria = '', sub, entryId] = route.parts ?? [route.param ?? ''];
  if (sub === 'wpis') return <WpisSerwisowy key={entryId ?? 'nowy'} siteId={siteId} kategoria={kategoria} entryId={entryId} jobId={route.highlight} />;
  return <Folder siteId={siteId} kategoria={kategoria} />;
}

function Folder({ siteId, kategoria }: { siteId: string; kategoria: string }) {
  const site = useEntity('sites', siteId);
  const client = useEntity('clients', site?.clientId);
  const loading = useLoading();
  const admin = useIsAdmin();
  const teczki = useTeczki(siteId);
  const t = teczki.find((x) => x.kategoria === kategoria);
  const cat = useCatColor();
  const [adding, setAdding] = useState(false);
  // „nowe” od ostatniej wizyty teczki (jak w karcie zlecenia): chwila z otwarcia trzymana do wyjścia
  const me = useMe();
  const key = seenKey(siteId, kategoria);
  const [opened, setOpened] = useState<{ key: string; at: string } | undefined>();
  useEffect(() => {
    if (!me) return;
    setOpened({ key, at: seenFor(me.id)(key) });
    markSeen(me.id, key, false); // tylko w telefonie: serwer przyjmuje „widziane” samych zleceń
    return () => markSeen(me.id, key, false);
  }, [me?.id, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => freshIn(t, opened?.key === key ? opened.at : undefined, me?.id), [t, opened, key, me?.id]);

  if (!site || !t) {
    return loading ? <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
      : <div className="mx-auto max-w-3xl p-4"><Empty icon={ClipboardText} title="Nie ma takiej teczki" hint="Teczka powstaje z pierwszym zleceniem tej kategorii na obiekcie.">{client && <a href={`#kl/${client.id}`} className="font-semibold text-action">Karta klienta</a>}</Empty></div>;
  }
  const back = client ? `#kl/${client.id}` : '#zl';
  return (
    <article className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <div className="grid gap-1">
        <a href={back} className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action"><ArrowLeft className="h-5 w-5" />{client?.nazwa ?? 'Klient'}</a>
        <h2 className="font-wide text-2xl font-extrabold leading-tight">{kategoria}</h2>
        <p className="text-sm text-ink-2">{[client?.nazwa, site.nazwa, site.adres, site.miejscowosc].filter(Boolean).join(', ')}</p>
      </div>
      <nav aria-label="Teczki obiektu" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {teczki.map((x) => (
          <a key={x.kategoria} href={pszHash(siteId, x.kategoria)} aria-current={x.kategoria === kategoria ? 'page' : undefined}
            className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-semibold', x.kategoria === kategoria ? 'border-ink bg-ink text-bg' : 'border-line bg-card hover:border-ink-2')}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: catStripe(cat(x.kategoria)) }} aria-hidden />{x.kategoria}
          </a>
        ))}
        {admin && <Button variant="secondary" size="icon" className="h-11 w-11" aria-label="Dodaj teczkę" onClick={() => setAdding(true)}><FolderSimplePlus className="h-5 w-5" /></Button>}
      </nav>
      {adding && <AddFolder siteId={siteId} have={teczki.map((x) => x.kategoria)} onClose={() => setAdding(false)} />}
      <ServiceBar t={t} siteId={siteId} />
      <Devices t={t} siteId={siteId} fresh={fresh} />
      <ServiceCard t={t} siteId={siteId} fresh={fresh} />
      <Documents t={t} siteId={siteId} fresh={fresh} />
      <Photos t={t} fresh={fresh} />
      <Jobs t={t} />
    </article>
  );
}

const Card = ({ title, count, action, children, label }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; label?: string }) => (
  <section className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-line bg-card p-4 shadow-card min-[560px]:p-5" aria-label={label ?? title}>
    <div className="flex items-center justify-between gap-3"><SectionTitle count={count}>{title}</SectionTitle>{action}</div>
    {children}
  </section>
);

/** Pasek „Następny serwis” z edycją terminu, cyklu i przypomnień (P12, P13). */
function ServiceBar({ t, siteId }: { t: T; siteId: string }) {
  const admin = useIsAdmin();
  const [edit, setEdit] = useState(false);
  const f = t.folder;
  const can = f ? !f._tmp : admin; // pracownik ustawia termin wpisem serwisowym, gdy teczki jeszcze nie ma
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3', t.nastepnySerwis ? 'border-action/40 bg-action/8' : 'border-line bg-card')}>
      <Bell className="h-6 w-6 shrink-0 text-action" weight="duotone" aria-hidden />
      <p className="min-w-0 flex-1">
        {t.nastepnySerwis ? <><span className="font-semibold">Następny serwis: <span className="tabular-nums">{fmtDay(t.nastepnySerwis)}</span></span> <SerwisBadge nastepny={t.nastepnySerwis} soonOnly /></>
          : <span className="font-semibold">Bez terminu następnego serwisu</span>}
        <span className="block text-sm text-ink-2">
          {[f?.cyklMies ? `co ${f.cyklMies} mies.` : 'bez cyklu', t.nastepnySerwis && (f?.przypomnienia === false ? 'bez przypomnień klientowi' : 'przypomnienie e-mail 30 i 7 dni wcześniej')].filter(Boolean).join(' · ')}
          {!f && !admin && ' · termin ustawisz przy wpisie serwisowym'}
        </span>
      </p>
      {can && <Button variant="secondary" size="sm" onClick={() => setEdit(true)}><PencilSimple className="h-4 w-4" />Zmień</Button>}
      {edit && <FolderForm t={t} siteId={siteId} onClose={() => setEdit(false)} />}
    </div>
  );
}

/** Edycja teczki: termin, cykl, przypomnienia; admin – notatka z rozliczeniem. Teczka bez wiersza (admin): POST /api/folders, potem PUT. */
function FolderForm({ t, siteId, onClose }: { t: T; siteId: string; onClose: () => void }) {
  const admin = useIsAdmin();
  const f = t.folder;
  const kat = useDict('kategoria').find((k) => k.wartosc === t.kategoria);
  const [d, setD] = useState<string>(f?.nastepnySerwis ?? '');
  const [cykl, setCykl] = useState<string>(String(f ? f.cyklMies ?? '' : kat?.cyklMies ?? ''));
  const [przyp, setPrzyp] = useState<boolean>(f?.przypomnienia ?? true);
  const [nota, setNota] = useState<string>(f?.notatkaRozliczenie ?? '');
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = cykl.trim() ? Number(cykl) : null;
    if (c !== null && (!Number.isInteger(c) || c < 1 || c > 120)) return setErr('Cykl: liczba miesięcy od 1 do 120');
    const patch = { nastepnySerwis: d || null, cyklMies: c, przypomnienia: przyp, ...(admin && { notatkaRozliczenie: nota.trim() }) };
    const put = (id: string) => updateVia('passport_folders', id, patch, { kind: 'paszport', url: `/api/folders/${id}`, method: 'PUT', body: patch });
    // bez wiersza teczki: POST i PUT w jednym elemencie kolejki (przetrwa zamknięcie aplikacji)
    const p = f ? put(f.id) : createVia('passport_folders', { kind: 'paszport', url: '/api/folders', method: 'POST', body: { siteId, kategoria: t.kategoria }, next: { url: '/api/folders/:id', method: 'PUT', body: patch } }, { siteId, kategoria: t.kategoria, ...patch });
    p.catch(fail('Nie zapisano teczki'));
    if (!navigator.onLine) toast('Zapisane w telefonie', { body: 'Zmiana wyśle się, gdy wróci zasięg.' });
    onClose();
  }
  const quick = (m: number) => setD(addMonths(today(), m));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={`Teczka: ${t.kategoria}`} description="Następny serwis i przypomnienia dla klienta.">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Następny serwis">{(id) => <Input id={id} type="date" value={d} onChange={(e) => setD(e.target.value)} />}</Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Termin od dziś">
            {[[4, '+4 mies.'], [6, '+6 mies.'], [12, '+1 rok']].map(([m, l]) => <Button key={m} variant="secondary" size="sm" onClick={() => quick(m as number)}>{l}</Button>)}
            {d && <Button variant="ghost" size="sm" onClick={() => setD('')}>Bez terminu</Button>}
          </div>
          <Field label="Cykl serwisu (miesiące)" hint="Puste = bez cyklu. Domyślny cykl kategorii ustawisz w Ustawieniach." error={err}>
            {(id, ds) => <Input id={id} aria-describedby={ds} aria-invalid={!!err} inputMode="numeric" value={cykl} onChange={(e) => { setCykl(e.target.value.replace(/\D/g, '')); setErr(''); }} />}
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><Checkbox checked={przyp} onCheckedChange={(v) => setPrzyp(v === true)} />Przypomnienia e-mail dla klienta</label>
          {admin && <Field label="Notatka z rozliczeniem" hint="Widzą ją tylko administratorzy.">{(id, ds) => <Textarea id={id} aria-describedby={ds} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Zaliczka, reszta przelewem…" />}</Field>}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit">Zapisz</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

const Klient = ({ on }: { on: boolean }) => (on
  ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ok"><Eye className="h-4 w-4" weight="bold" aria-hidden />dla klienta</span>
  : <span className="shrink-0 text-xs font-semibold text-ink-2">wewn.</span>);

function Devices({ t, siteId, fresh }: { t: T; siteId: string; fresh: Set<string> }) {
  const canEdit = useCanEdit();
  const jobs = useEntities('jobs');
  const numer = (id?: string | null) => jobs.find((j) => j.id === id)?.numer;
  const [form, setForm] = useState<{ d?: Rec } | null>(null);
  const list = withoutEchoes(t.devices, ['nazwa', 'model', 'nrSeryjny']);
  return (
    <Card title="Urządzenia" count={list.length} action={<Button variant="secondary" size="sm" onClick={() => setForm({})}><Plus className="h-4 w-4" weight="bold" />Urządzenie</Button>}>
      {!list.length ? <p className="text-sm text-ink-2">Brak urządzeń. Dodaj rekuperator, jednostkę, falownik – z numerem seryjnym i gwarancją.</p> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line">
          {list.map((d) => (
            <li key={d.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{[d.nazwa, d.producent, d.model].filter(Boolean).join(' ')}</p>
                <p className="text-sm text-ink-2">{[d.nrSeryjny && `nr ser. ${d.nrSeryjny}`, d.montaz && `montaż ${fmtDay(d.montaz)}${numer(d.jobId) ? ` (${numer(d.jobId)})` : ''}`, d.gwarancjaDo && `gwarancja do ${fmtDay(d.gwarancjaDo)}`].filter(Boolean).join(' · ')}</p>
                {d.uwagi && <p className="mt-1 text-sm whitespace-pre-wrap">{d.uwagi}</p>}
              </div>
              {fresh.has(d.id) && <NewMark sr="nowe urządzenie od ostatniej wizyty" />}
              <Klient on={!!d.dlaKlienta} />
              {!d._tmp && canEdit(d.createdBy) && <Button variant="ghost" size="icon" className="-my-2 h-11 w-11" aria-label={`Edytuj urządzenie ${d.nazwa}`} onClick={() => setForm({ d })}><PencilSimple className="h-5 w-5" /></Button>}
            </li>
          ))}
        </ul>
      )}
      {form && <DeviceForm t={t} siteId={siteId} device={form.d} onClose={() => setForm(null)} />}
    </Card>
  );
}

function ServiceCard({ t, siteId, fresh }: { t: T; siteId: string; fresh: Set<string> }) {
  const names = useNames();
  const canEdit = useCanEdit();
  const photos = useMemo(() => { const m = new Map<string, number>(); for (const p of t.photos) if (p.a.ownerType === 'service') m.set(p.a.ownerId, (m.get(p.a.ownerId) ?? 0) + 1); return m; }, [t.photos]);
  const list = withoutEchoes(t.entries, ['dzien', 'uwagi', 'authorId', 'czynnosci']);
  return (
    <Card title="Karta serwisowa" count={list.length} action={<a href={pszHash(siteId, t.kategoria, '/wpis')} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-action-ink hover:brightness-110"><Plus className="h-4 w-4" weight="bold" />Wpis</a>}>
      {!list.length ? <p className="text-sm text-ink-2">Brak wpisów. Po serwisie dodaj wpis: co zrobiono, zdjęcia i termin następnego.</p> : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b border-line text-ink-2"><th scope="col" className="px-1 py-2 font-semibold">Data</th><th scope="col" className="px-2 py-2 font-semibold">Co zrobiono</th><th scope="col" className="px-1 py-2 font-semibold">Kto</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-line align-top last:border-0">
                  <td className="px-1 py-2.5 whitespace-nowrap tabular-nums">
                    {!e._tmp && canEdit(e.authorId) ? <a href={pszHash(siteId, t.kategoria, `/wpis/${e.id}`)} className="font-semibold text-action underline-offset-2 hover:underline" aria-label={`Edytuj wpis z ${fmtDay(e.dzien)}`}>{fmtDay(e.dzien)}</a> : fmtDay(e.dzien)}
                    {fresh.has(e.id) && <span className="mt-1 block"><NewMark sr="nowy wpis od ostatniej wizyty" /></span>}
                    {e._tmp && <span className="block text-xs text-ink-2">wysyłanie…</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="block">{(e.czynnosci as string[] | undefined)?.join(', ') || '–'}</span>
                    {e.uwagi && <span className="block whitespace-pre-wrap text-ink-2">{e.uwagi}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      {photos.get(e.id) ? <span className="inline-flex items-center gap-1 text-xs text-ink-2"><Images className="h-4 w-4" aria-hidden />{plural(photos.get(e.id)!, ['zdjęcie', 'zdjęcia', 'zdjęć'])}</span> : null}
                      {!e.dlaKlienta && <span className="text-xs font-semibold text-ink-2">wewn.</span>}
                    </span>
                  </td>
                  <td className="px-1 py-2.5">{names(e.authorId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const docIcon = (a: Rec) => (a.typDok === 'faktura' ? Receipt : a.mime === 'application/pdf' || /\.pdf$/i.test(a.nazwa ?? '') ? FilePdf : FileText);
const SOURCE: Record<string, string> = { teczka: 'w teczce', service: 'wpis serwisowy', device: 'urządzenie' };

/** Dokumenty: pliki teczki i z dzienników zleceń (P4, P5); faktury i rozliczenie tylko admin (serwer ich pracownikowi nie wysyła). */
function Documents({ t, siteId, fresh }: { t: T; siteId: string; fresh: Set<string> }) {
  const admin = useIsAdmin();
  const canEdit = useCanEdit();
  const jobs = useEntities('jobs');
  const [doc, setDoc] = useState<Rec | null>(null);
  const [upload, setUpload] = useState(false);
  const [nota, setNota] = useState(false);
  const numer = (id?: string) => jobs.find((j) => j.id === id)?.numer;
  const docs = t.docs;
  const n = t.folder?.notatkaRozliczenie as string | undefined;
  return (
    <Card title="Dokumenty" count={docs.length} action={<Button variant="secondary" size="sm" onClick={() => setUpload(true)}><UploadSimple className="h-4 w-4" />Plik</Button>}>
      {!docs.length && !(admin && n) && <p className="text-sm text-ink-2">Brak dokumentów. Projekty, oferty i instrukcje dodane tu albo w dzienniku zlecenia trafiają do teczki.</p>}
      <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line">
        {docs.map(({ a, jobId }) => {
          const I = docIcon(a);
          return (
            <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', a.typDok === 'faktura' ? 'bg-action/12 text-action' : 'bg-danger/10 text-danger')}><I className="h-6 w-6" aria-hidden /></span>
              <a href={fileUrl(a, 'orig')} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <span className="block truncate font-semibold hover:underline">{a.nazwa}</span>
                <span className="block truncate text-sm text-ink-2">{[a.typDok ? TYP_LABEL[a.typDok] : 'Plik', jobId ? numer(jobId) ?? 'zlecenie' : SOURCE[a.ownerType], a._tmp && 'wysyłanie…'].filter(Boolean).join(' · ')}</span>
              </a>
              {fresh.has(a.id) && <NewMark sr="nowy plik od ostatniej wizyty" />}
              <Klient on={!!a.dlaKlienta} />
              {!a._tmp && (admin || canEdit(a.authorId)) && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Ustawienia pliku ${a.nazwa}`} onClick={() => setDoc(a)}><PencilSimple className="h-5 w-5" /></Button>}
            </li>
          );
        })}
        {admin && (
          <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ok/12 text-ok"><Notepad className="h-6 w-6" aria-hidden /></span>
            <button type="button" onClick={() => setNota(true)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold">Rozliczenie (notatka)</span>
              <span className="block truncate text-sm text-ink-2">{n || 'Brak notatki – dodaj zaliczki, sposób płatności'}</span>
            </button>
            <span className="shrink-0 text-xs font-semibold text-ink-2">tylko admin</span>
          </li>
        )}
      </ul>
      {doc && <DocSheet a={doc} onClose={() => setDoc(null)} />}
      {upload && <UploadForm t={t} siteId={siteId} onClose={() => setUpload(false)} />}
      {nota && <FolderForm t={t} siteId={siteId} onClose={() => setNota(false)} />}
    </Card>
  );
}

/** Ustawienia pliku: typ dokumentu (admin albo autor; faktura tylko admin), „W paszporcie dla klienta” (admin), usunięcie pliku teczki. */
export function DocSheet({ a: a0, onClose }: { a: Rec; onClose: () => void }) {
  const a = useEntity('attachments', a0.id) ?? a0;
  const admin = useIsAdmin();
  const canEdit = useCanEdit();
  const [ask, setAsk] = useState(false);
  const typ = (v: string) => void updateVia('attachments', a.id, { typDok: v }, { kind: 'paszport', url: `/api/attachments/${a.id}`, method: 'PATCH', body: { typDok: v } }).catch(fail('Nie zmieniono typu'));
  const klient = (v: boolean) => void updateVia('attachments', a.id, { dlaKlienta: v }, { kind: 'paszport', url: `/api/attachments/${a.id}`, method: 'PATCH', body: { dlaKlienta: v } }).catch(fail('Nie zapisano'));
  const remove = () => {
    void outbox.enqueue({ kind: 'paszport', url: `/api/folder-files/${a.id}`, method: 'DELETE', optimistic: (s) => s.remove('attachments', a.id) }).catch(fail('Nie usunięto pliku'));
    onClose();
  };
  const typEdit = admin || (canEdit(a.authorId) && a.typDok !== 'faktura');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={a.nazwa ?? 'Plik'} description="Typ dokumentu i widoczność w paszporcie.">
        <div className="grid gap-4">
          {typEdit && <Field label="Typ dokumentu">{(id) => <Select id={id} value={a.typDok ?? undefined} onValueChange={typ} placeholder="Wybierz typ" options={typOptions(admin)} />}</Field>}
          {admin && <div><KlientToggle on={!!a.dlaKlienta} onChange={klient} label="W paszporcie dla klienta" /></div>}
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
            {a.ownerType === 'teczka' && canEdit(a.authorId) && (ask
              ? <Button variant="danger" onClick={remove} autoFocus><Trash className="h-4 w-4" />Na pewno usunąć plik?</Button>
              : <Button variant="ghost" className="mr-auto text-danger" onClick={() => setAsk(true)}><Trash className="h-4 w-4" />Usuń plik</Button>)}
            <Button variant="secondary" onClick={onClose}>Gotowe</Button>
          </div>
        </div>
      </Sheet>
    </Dialog>
  );
}

/** Plik dodany w teczce (P5): POST /api/uploads, potem /api/folder-files z typem; przez kolejkę offline. */
function UploadForm({ t, siteId, onClose }: { t: T; siteId: string; onClose: () => void }) {
  const admin = useIsAdmin();
  const me = useMe();
  const { files, busy, previews, buttons } = usePicker();
  const [typ, setTyp] = useState('projekt');
  const [klient, setKlient] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    for (const f of files) {
      const body = { ...target(t, siteId, t.kategoria), typDok: typ, dlaKlienta: admin && klient };
      void createVia('attachments', { kind: 'paszport', url: '/api/folder-files', method: 'POST', body, files: [f.file], uploadsAs: 'uploadId' },
        { ownerType: 'teczka', ownerId: t.folder?.id ?? '', siteId, kategoria: t.kategoria, rodzaj: f.img ? 'zdjecie' : 'plik', nazwa: f.name, typDok: typ, dlaKlienta: body.dlaKlienta, _src: f.url, authorId: me?.id })
        .then(() => URL.revokeObjectURL(f.url), fail(`Nie dodano pliku ${f.name}`));
    }
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Dodaj plik do teczki" description={`${t.kategoria}: projekt, oferta, instrukcja${admin ? ', faktura' : ''}.`}>
        <form onSubmit={submit} className="grid gap-4">
          <div className="flex flex-wrap gap-2">{buttons}</div>
          {previews}
          <Field label="Typ dokumentu">{(id) => <Select id={id} value={typ} onValueChange={setTyp} options={typOptions(admin)} />}</Field>
          {admin && <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><Checkbox checked={klient} onCheckedChange={(v) => setKlient(v === true)} />W paszporcie dla klienta</label>}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={!files.length || busy}><UploadSimple className="h-5 w-5" />Dodaj {files.length > 1 ? `(${files.length})` : ''}</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

function Photos({ t, fresh }: { t: T; fresh: Set<string> }) {
  const admin = useIsAdmin();
  const jobs = useEntities('jobs');
  const [view, setView] = useState<number | null>(null);
  const numer = (p: Plik) => (p.jobId ? jobs.find((j) => j.id === p.jobId)?.numer : SOURCE[p.a.ownerType]);
  const from = [...new Set(t.photos.map((p) => p.jobId && jobs.find((j) => j.id === p.jobId)?.numer).filter(Boolean))].join(' · ');
  const photos = t.photos.map((p) => p.a);
  return (
    <Card title="Zdjęcia" count={photos.length} action={from ? <span className="truncate text-sm text-ink-2">{from}</span> : undefined}>
      {!photos.length ? <p className="text-sm text-ink-2">Zdjęcia z dzienników zleceń i wpisów serwisowych pojawią się tu same.</p> : (
        <ul className="grid grid-cols-3 gap-2 min-[560px]:grid-cols-4">
          {t.photos.map((p, i) => (
            <li key={p.a.id} className="relative">
              <button type="button" onClick={() => setView(i)} className="block w-full overflow-hidden rounded-xl bg-line/50" aria-label={`Zdjęcie ${i + 1}${numer(p) ? `, ${numer(p)}` : ''}, powiększ`}>
                <img src={fileUrl(p.a, 'thumb')} alt="" loading="lazy" decoding="async" width={160} height={160} className="aspect-square h-auto w-full object-cover" />
              </button>
              {numer(p) && <span className="pointer-events-none absolute right-1 bottom-1 rounded-full bg-[#050f1d]/75 px-2 py-0.5 text-xs font-semibold text-white">{numer(p)}</span>}
              {fresh.has(p.a.id) && <span className="pointer-events-none absolute top-1 left-1"><NewMark sr="nowe zdjęcie od ostatniej wizyty" /></span>}
              {admin && p.a.dlaKlienta && <span className="pointer-events-none absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-full bg-ok text-ok-ink" title="W paszporcie dla klienta"><Eye className="h-3.5 w-3.5" weight="bold" /></span>}
            </li>
          ))}
        </ul>
      )}
      {view !== null && photos[view] && <Viewer photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} admin={admin} />}
    </Card>
  );
}

function Jobs({ t }: { t: T }) {
  const all = useEntities('jobs');
  const jobs = useMemo(() => all.filter((j) => t.jobIds.includes(j.id)).sort((a, b) => String(b.numer).localeCompare(String(a.numer), 'pl', { numeric: true })), [all, t.jobIds]);
  return (
    <Card title="Zlecenia w teczce" count={jobs.length}>
      {!jobs.length ? <p className="text-sm text-ink-2">Brak zleceń tej kategorii na obiekcie.</p> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <a href={`#zl/${j.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line px-3 py-2.5 hover:border-ink-2">
                <Briefcase className="h-5 w-5 text-ink-2" aria-hidden /><span className="font-semibold tabular-nums">{j.numer}</span>
                <span>{j.rodzaj}</span><Badge tone="action">{j.status}</Badge><span className="ml-auto text-sm text-ink-2 capitalize">{fmtTermin(j.termin)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
