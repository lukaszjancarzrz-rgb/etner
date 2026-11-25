import { PODMIEJSCA } from '@etner/shared';
import { TitleCount } from '../../core/layout/TopBar.js';
import { Check, MagnifyingGlass, PencilSimple, Plus, Trash, Wrench } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, matches, today, useIsAdmin, useLoading, useMe } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { useDesk } from '../../core/layout/status.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Search } from '../../core/ui/search.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const MAGAZYN = '__magazyn';
const W = { kind: 'narzedzia' } as const;
const byName = (a: Rec, b: Rec) => a.nazwa.localeCompare(b.nazwa, 'pl');

/** Miejsce narzędzia: „Mała Toyota · Górna półka na regale” albo „Magazyn” (R42: nazwa auta z listy aut). */
const placeOf = (t: Rec, cars: Map<string, Rec>) => (t.carId ? `${cars.get(t.carId)?.nazwa ?? 'Samochód'} · ${t.podmiejsce}` : 'Magazyn');

/** Stan narzędzi: wyszukiwanie po wszystkich miejscach, bez niego sekcje per miejsce (w aucie wg podmiejsca). Zmiany tylko admin, w trybie „Edytuj listy” (R43). */
export function Narzedzia() {
  const carsList = useEntities('cars');
  const raw = useEntities('tools');
  const tools = useMemo(() => withoutEchoes(raw, ['nazwa', 'carId', 'podmiejsce', 'sn', 'by']), [raw]);
  const loading = useLoading();
  const admin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Rec | 'new' | null>(null);
  const [card, setCard] = useState<string | null>(null); // karta narzędzia: dane i historia serwisowa
  const desk = useDesk();
  const cars = useMemo(() => [...carsList].filter((c) => !c._tmp).sort((a, b) => a.kolejnosc - b.kolejnosc || a.createdAt.localeCompare(b.createdAt)), [carsList]);
  const carMap = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const found = useMemo(() => (q.trim() ? tools.filter((t) => matches(q, t.nazwa, t.sn)).sort((a, b) => byName(a, b) || placeOf(a, carMap).localeCompare(placeOf(b, carMap), 'pl')) : null), [q, tools, carMap]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie narzędzi"><Skeleton className="h-12" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>;

  const open = admin && editing ? (t: Rec) => setEdit(t) : undefined;
  const show = (t: Rec) => { if (!t._tmp) setCard(t.id); };
  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:max-w-6xl desk:py-6">
      <Search value={q} onChange={setQ} label="Szukaj narzędzia" placeholder="Szukaj, np. wkrętarka albo numer seryjny" />
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-action/40 bg-action/5 px-4 py-2">
          <p className="mr-auto text-sm font-semibold">Edycja list: dodaj, popraw, przenieś albo usuń narzędzie.</p>
          <Button size="sm" onClick={() => setEdit('new')}><Plus className="h-4 w-4" weight="bold" />Dodaj narzędzie</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}><Check className="h-4 w-4" weight="bold" />Gotowe</Button>
        </div>
      )}
      {found && (!desk || !found.length) ? (
        found.length ? (
          <div className="grid gap-2">
            <SectionTitle count={found.length}>Gdzie szukać</SectionTitle>
            <ul className="grid gap-2" aria-label="Wyniki wyszukiwania">{found.map((t) => <ToolRow key={t.id} t={t} place={placeOf(t, carMap)} onEdit={open} onShow={show} />)}</ul>
          </div>
        ) : <Empty icon={MagnifyingGlass} title="Nie ma takiego narzędzia" hint={admin ? 'Sprawdź pisownię albo dodaj narzędzie w trybie „Edytuj listy”.' : 'Sprawdź pisownię. Brakujące narzędzie dopisuje administrator.'} />
      ) : desk && tools.length ? (
        <ToolTable tools={found ?? tools} cars={cars} carMap={carMap} onEdit={open} onShow={show} />
      ) : !tools.length ? (
        <Empty icon={Wrench} title="Lista narzędzi jest pusta" hint={admin ? 'Dodaj narzędzia z samochodów i Magazynu w trybie „Edytuj listy”, żeby każdy wiedział, gdzie ich szukać.' : 'Administrator dopisze narzędzia z samochodów i Magazynu.'} />
      ) : (
        <>
          {cars.map((c) => {
            const list = tools.filter((t) => t.carId === c.id);
            return (
              <div key={c.id} className="grid gap-2">
                <SectionTitle count={list.length}>{c.nazwa}</SectionTitle>
                {!list.length ? <p className="px-1 text-sm text-ink-2">Brak narzędzi w tym samochodzie.</p> : (
                  <div className="overflow-hidden rounded-[4px] border border-line bg-card">
                    {PODMIEJSCA.map((pm) => {
                      const sub = list.filter((t) => t.podmiejsce === pm).sort(byName);
                      if (!sub.length) return null;
                      return (
                        <div key={pm} className="border-b border-line/70 last:border-b-0">
                          <h3 className="bg-bg/60 px-4 py-1.5 text-xs font-bold tracking-wide text-ink-2 uppercase">{pm}</h3>
                          <ul aria-label={`${c.nazwa} · ${pm}`} className="divide-y divide-line/70">{sub.map((t) => <ToolRow key={t.id} t={t} flat onEdit={open} onShow={show} />)}</ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {(() => {
            const list = tools.filter((t) => !t.carId).sort(byName);
            return (
              <div className="grid gap-2">
                <SectionTitle count={list.length}>Magazyn</SectionTitle>
                {list.length ? <ul aria-label="Magazyn" className="divide-y divide-line/70 overflow-hidden rounded-[4px] border border-line bg-card">{list.map((t) => <ToolRow key={t.id} t={t} flat onEdit={open} onShow={show} />)}</ul>
                  : <p className="px-1 text-sm text-ink-2">Brak narzędzi w Magazynie.</p>}
              </div>
            );
          })()}
        </>
      )}
      {admin && !editing && <div className="flex justify-center desk:justify-start"><Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-ink-2"><PencilSimple className="h-4 w-4" />Edytuj listy</Button></div>}
      {edit && <ToolForm tool={edit === 'new' ? undefined : edit} cars={cars} onClose={() => setEdit(null)} />}
      {card && tools.some((t) => t.id === card) && <ToolCard tool={tools.find((t) => t.id === card)!} place={placeOf(tools.find((t) => t.id === card)!, carMap)} onEdit={admin ? (t) => { setCard(null); setEdit(t); } : undefined} onClose={() => setCard(null)} />}
      <TitleCount n={(found ?? tools).length} />
    </section>
  );
}

/** Komputer: jedna tabela wszystkich narzędzi (też wyniki wyszukiwania); domyślnie auta w kolejności listy aut, w aucie wg podmiejsca, Magazyn na końcu. */
function ToolTable({ tools, cars, carMap, onEdit, onShow }: { tools: Rec[]; cars: Rec[]; carMap: Map<string, Rec>; onEdit?: (t: Rec) => void; onShow: (t: Rec) => void }) {
  const carAt = useMemo(() => new Map(cars.map((c, i) => [c.id as string, i])), [cars]);
  const auto = (t: Rec) => (t.carId ? (carMap.get(t.carId)?.nazwa as string | undefined) ?? 'Samochód' : '');
  const pos = (t: Rec) => (t.carId ? (carAt.get(t.carId) ?? cars.length) * 100 + PODMIEJSCA.indexOf(t.podmiejsce) : 1e6);
  const list = useMemo(() => [...tools].sort((a, b) => pos(a) - pos(b) || byName(a, b)), [tools, carAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows, by } = useSort(list, { nazwa: (t) => t.nazwa, sn: (t) => t.sn, faktura: (t) => t.faktura, data: (t) => t.dataZakupu ?? '', miejsce: (t) => (t.carId ? t.podmiejsce : 'Magazyn'), auto });
  return (
    <Table aria-label="Narzędzia">
      <thead>
        <tr>
          <Th sort={by('nazwa')}>Narzędzie</Th>
          <Th sort={by('sn')} className="w-[14%]">SN</Th>
          <Th sort={by('faktura')} className="w-[14%]">Faktura</Th>
          <Th sort={by('data')} className="w-[9rem]">Data zakupu</Th>
          <Th sort={by('miejsce')} className="w-[20%]">Miejsce</Th>
          <Th sort={by('auto')} className="w-[13%]">Auto</Th>
          {onEdit && <Th className="w-12"><span className="sr-only">Edycja</span></Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <Tr key={t.id} onOpen={() => onShow(t)}>
            <Td className="font-semibold" title={t.nazwa}><button type="button" onClick={() => onShow(t)} className="max-w-full truncate text-left hover:text-action">{t.nazwa}</button></Td>
            <Td title={t.sn}>{t.sn || '—'}</Td>
            <Td title={t.faktura}>{t.faktura || '—'}</Td>
            <Td>{t.dataZakupu ? fmtDay(t.dataZakupu) : '—'}</Td>
            <Td>{t.carId ? t.podmiejsce : 'Magazyn'}</Td>
            <Td className="text-ink-2">{auto(t) || '—'}</Td>
            {onEdit && <Td pad="px-1">{t._tmp ? <span className="sr-only">wysyłanie</span>
              : <button type="button" aria-label={`Edytuj: ${t.nazwa}, ${placeOf(t, carMap)}`} onClick={() => onEdit(t)}
                className="grid h-[calc(var(--row-h)-6px)] w-full place-items-center rounded-[3px] text-ink-2 hover:bg-ink/6 hover:text-ink"><PencilSimple className="h-4 w-4" /></button>}</Td>}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ToolRow({ t, place, flat, onEdit, onShow }: { t: Rec; place?: string; flat?: boolean; onEdit?: (t: Rec) => void; onShow: (t: Rec) => void }) {
  return (
    <li className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 pr-2 pl-4', !flat && 'rounded-[4px] border border-line bg-card')}>
      <button type="button" onClick={() => onShow(t)} className="min-w-0 text-left">
        <p className="font-semibold leading-snug">{t.nazwa}</p>
        {place && <p className="text-sm text-ink-2">{place}</p>}
        {(t.sn || t.faktura || t.dataZakupu) && <p className="text-sm text-ink-2">{[t.sn && `SN ${t.sn}`, t.faktura && `FV ${t.faktura}`, t.dataZakupu && `kupione ${fmtDay(t.dataZakupu)}`].filter(Boolean).join(' · ')}</p>}
      </button>
      {t._tmp ? <span className="px-2 text-sm text-ink-2">wysyłanie…</span>
        : onEdit && <Button variant="ghost" size="sm" aria-label={`Edytuj: ${t.nazwa}${place ? `, ${place}` : ''}`} onClick={() => onEdit(t)} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>}
    </li>
  );
}

function ToolForm({ tool, cars, onClose }: { tool?: Rec; cars: Rec[]; onClose: () => void }) {
  const me = useMe();
  const [nazwa, setNazwa] = useState<string>(tool?.nazwa ?? '');
  const [miejsce, setMiejsce] = useState<string>(tool ? tool.carId ?? MAGAZYN : cars[0]?.id ?? MAGAZYN);
  const [pm, setPm] = useState<string>(tool?.podmiejsce ?? '');
  const [sn, setSn] = useState<string>(tool?.sn ?? '');
  const [faktura, setFaktura] = useState<string>(tool?.faktura ?? '');
  const [data, setData] = useState<string>(tool?.dataZakupu ?? '');
  const [err, setErr] = useState<{ nazwa?: string; pm?: string }>({});
  const [confirm, setConfirm] = useState(false);
  const inCar = miejsce !== MAGAZYN;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = nazwa.trim();
    const errs = { nazwa: !n ? 'Wpisz nazwę narzędzia' : n.length > 200 ? 'Nazwa jest za długa' : undefined, pm: inCar && !pm ? 'Wybierz miejsce w samochodzie' : undefined };
    if (errs.nazwa || errs.pm) return setErr(errs);
    const body = { nazwa: n, carId: inCar ? miejsce : null, podmiejsce: inCar ? pm : null, sn: sn.trim().slice(0, 100), faktura: faktura.trim().slice(0, 200), dataZakupu: data || null };
    const p = tool
      ? updateVia('tools', tool.id, body, { ...W, url: `/api/tools/${tool.id}`, method: 'PUT', body })
      : createVia('tools', { ...W, url: '/api/tools', method: 'POST', body }, { ...body, by: me?.id });
    void p.catch(fail('Narzędzie nie zostało zapisane'));
    onClose();
  }
  function remove() {
    if (!confirm) return setConfirm(true);
    void outbox.enqueue({ ...W, url: `/api/tools/${tool!.id}`, method: 'DELETE', optimistic: (s) => s.remove('tools', tool!.id) }).catch(fail('Nie usunięto narzędzia'));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={tool ? 'Narzędzie' : 'Nowe narzędzie'}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Nazwa" error={err.nazwa}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.nazwa} value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="np. Wkrętarka Makita" />}</Field>
          <Field label="Miejsce">{(id) => <Select id={id} value={miejsce} onValueChange={setMiejsce} options={[...cars.map((c) => ({ value: c.id as string, label: c.nazwa as string })), { value: MAGAZYN, label: 'Magazyn' }]} />}</Field>
          {inCar && <Field label="Gdzie w samochodzie" error={err.pm}>{(id, d) => <Select id={id} aria-describedby={d} aria-invalid={!!err.pm} value={pm || undefined} onValueChange={setPm} placeholder="Wybierz miejsce" options={PODMIEJSCA.map((x) => ({ value: x, label: x }))} />}</Field>}
          <Field label="Numer seryjny (SN)">{(id) => <Input id={id} value={sn} onChange={(e) => setSn(e.target.value)} maxLength={100} />}</Field>
          <div className="grid gap-4 min-[480px]:grid-cols-2">
            <Field label="Faktura (numer)">{(id) => <Input id={id} value={faktura} onChange={(e) => setFaktura(e.target.value)} maxLength={200} placeholder="np. FV 123/2026" />}</Field>
            <Field label="Data zakupu">{(id) => <Input id={id} type="date" value={data} onChange={(e) => setData(e.target.value)} />}</Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {tool ? <Button variant={confirm ? 'danger' : 'ghost'} onClick={remove} className={cn(!confirm && 'text-danger')}>{confirm ? 'Na pewno usunąć?' : 'Usuń narzędzie'}</Button> : <span />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>Anuluj</Button>
              <Button type="submit">Zapisz</Button>
            </div>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

/** Karta narzędzia: dane (miejsce, SN, faktura, data zakupu) i historia serwisowa; zmiany – admin. */
function ToolCard({ tool, place, onEdit, onClose }: { tool: Rec; place: string; onEdit?: (t: Rec) => void; onClose: () => void }) {
  const desk = useDesk();
  const me = useMe();
  const admin = !!onEdit;
  const all = useEntities('tool_service');
  const hist = useMemo(() => withoutEchoes(all.filter((x) => x.toolId === tool.id), ['toolId', 'dzien', 'czynnosc']).sort((a, b) => b.dzien.localeCompare(a.dzien) || b.createdAt.localeCompare(a.createdAt)), [all, tool.id]);
  const [dzien, setDzien] = useState(today());
  const [czynnosc, setCzynnosc] = useState('');
  const [zmiana, setZmiana] = useState<Rec | null>(null);
  const [usun, setUsun] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const S = { kind: 'narzedzia-serwis' } as const;

  function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const c = czynnosc.trim();
    if (!c || !dzien) return setErr(!dzien ? 'Wpisz datę' : 'Wpisz czynność');
    if (c.length > 500) return setErr('Opis jest za długi');
    const body = { dzien, czynnosc: c };
    const p = zmiana ? updateVia('tool_service', zmiana.id, body, { ...S, url: `/api/tool-service/${zmiana.id}`, method: 'PUT', body })
      : createVia('tool_service', { ...S, url: `/api/tools/${tool.id}/service`, method: 'POST', body }, { ...body, toolId: tool.id, by: me?.id });
    void p.catch(fail('Wpis serwisowy nie został zapisany'));
    setCzynnosc(''); setDzien(today()); setZmiana(null); setErr('');
  }
  const popraw = (x: Rec) => { setZmiana(x); setDzien(x.dzien); setCzynnosc(x.czynnosc); setErr(''); };
  const kasuj = (x: Rec) => {
    if (usun !== x.id) return setUsun(x.id);
    void outbox.enqueue({ ...S, url: `/api/tool-service/${x.id}`, method: 'DELETE', optimistic: (s) => s.remove('tool_service', x.id) }).catch(fail('Nie usunięto wpisu'));
    setUsun(null);
  };
  const akcje = (x: Rec) => admin && !x._tmp && (
    <span className="flex shrink-0 gap-1">
      <Button variant="ghost" size="sm" className="w-10 px-0 text-ink-2" aria-label={`Popraw wpis ${fmtDay(x.dzien)}`} onClick={() => popraw(x)}><PencilSimple className="h-4 w-4" /></Button>
      <Button variant={usun === x.id ? 'danger' : 'ghost'} size="sm" className={cn(usun === x.id ? 'px-2' : 'w-10 px-0 text-ink-2')} aria-label={usun === x.id ? 'Na pewno usunąć wpis?' : `Usuń wpis ${fmtDay(x.dzien)}`} onClick={() => kasuj(x)}>{usun === x.id ? 'Usunąć?' : <Trash className="h-4 w-4" />}</Button>
    </span>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={tool.nazwa} className="desk:w-[min(46rem,94vw)]">
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm min-[560px]:grid-cols-4">
            {([['Miejsce', place], ['SN', tool.sn], ['Faktura', tool.faktura], ['Data zakupu', tool.dataZakupu ? fmtDay(tool.dataZakupu) : '']] as const).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-ink-2">{k}</dt><dd className="font-semibold break-words">{v || '—'}</dd></div>
            ))}
          </dl>
          {onEdit && <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => onEdit(tool)}><PencilSimple className="h-4 w-4" />Edytuj dane narzędzia</Button>}
          <section aria-label="Historia serwisowa" className="grid gap-2">
            <SectionTitle count={hist.length}>Historia serwisowa</SectionTitle>
            {!hist.length ? <p className="text-sm text-ink-2">Brak wpisów serwisowych.</p> : desk ? (
              <Table aria-label={`Historia serwisowa: ${tool.nazwa}`}>
                <thead><tr><Th className="w-[8rem]">Data</Th><Th>Czynność</Th>{admin && <Th className="w-[6.5rem]"><span className="sr-only">Zmiany</span></Th>}</tr></thead>
                <tbody>{hist.map((x) => (
                  <Tr key={x.id}><Td className="align-top">{fmtDay(x.dzien)}</Td><Td className="whitespace-normal">{x.czynnosc}</Td>{admin && <Td pad="px-1 py-1">{akcje(x)}</Td>}</Tr>
                ))}</tbody>
              </Table>
            ) : (
              <ul className="divide-y divide-line/70 rounded-[4px] border border-line">{hist.map((x) => (
                <li key={x.id} className="flex items-start gap-3 py-2 pr-1 pl-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{fmtDay(x.dzien)}</p><p className="break-words">{x.czynnosc}</p></div>{akcje(x)}</li>
              ))}</ul>
            )}
            {admin && (
              <form onSubmit={zapisz} noValidate className="grid gap-3 rounded-[4px] border border-line bg-bg/40 p-3 min-[560px]:grid-cols-[10rem_minmax(0,1fr)_auto] min-[560px]:items-end">
                <Field label="Data">{(id) => <Input id={id} type="date" value={dzien} onChange={(e) => setDzien(e.target.value)} />}</Field>
                <Field label="Czynność" error={err || undefined}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={czynnosc} onChange={(e) => setCzynnosc(e.target.value)} maxLength={500} placeholder="np. wymiana szczotek, przegląd" />}</Field>
                <div className="flex gap-2">
                  {zmiana && <Button variant="secondary" onClick={() => { setZmiana(null); setCzynnosc(''); setDzien(today()); }}>Anuluj</Button>}
                  <Button type="submit">{zmiana ? 'Zapisz zmianę' : <><Plus className="h-4 w-4" weight="bold" />Dodaj wpis</>}</Button>
                </div>
              </form>
            )}
          </section>
        </div>
      </Sheet>
    </Dialog>
  );
}
