import { ArrowRight, Briefcase, X } from '@phosphor-icons/react';
import { fmtMinuty, fmtZl, parametryMiesiaca, SPOSOB_LABEL, type Sposob } from '@etner/shared';
import { useMemo, useState } from 'react';
import { dayShort, matches, today, useDict, useStatusGroup } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CatTab, useCatColor } from '../../core/ui/category.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Search } from '../../core/ui/search.js';
import { Select } from '../../core/ui/select.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { Tips } from '../../core/ui/tip.js';
import { useCzasRobocizny, useKosztDnia, useParametry } from '../place/dane.js';
import { wynikiOkresu, type WierszZlecenia } from './model.js';
import { Poziome, Wykres } from './Wykresy.js';

const proc = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const zl0 = (gr: number) => Math.round(gr / 100).toLocaleString('pl-PL');
const dn = (v: number) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
const mies = (m: string) => `${m.slice(5)}.${m.slice(0, 4)}`;
const C = { przychod: 'var(--ok)', mat: '#b9770e', rob: '#5b6fa8', wynik: 'var(--action)', strata: 'var(--danger)' };
const ALL = '*';

// filtry zostają po wyjściu do karty zlecenia i „Wróć” (do odświeżenia strony)
const pamiec: { od?: string; do?: string; branza?: string; ekipa?: string; wg?: 'faktura' | 'praca'; q?: string } = {};
function useF<K extends keyof typeof pamiec>(k: K, init: NonNullable<(typeof pamiec)[K]>) {
  const [v, set] = useState(pamiec[k] ?? init);
  return [v as NonNullable<(typeof pamiec)[K]>, (x: NonNullable<(typeof pamiec)[K]>) => { pamiec[k] = x; set(x); }] as const;
}

/** Wyniki zleceń w okresie (właściciel 2026-11-20): filtry, sumy, tabela, wykres wybranego zlecenia, marża wg branży, wynik na roboczodzień. */
export function WynikiZlecen({ rok }: { rok: string }) {
  const desk = useDesk();
  const jobs = useEntities('jobs'), revenues = useEntities('revenues'), entries = useEntities('schedule_entries'), clients = useEntities('clients');
  const koszt = useKosztDnia(), czas = useCzasRobocizny(), parametry = useParametry() ?? {};
  const grupa = useStatusGroup(), kolor = useCatColor();
  const branze = useDict('kategoria'), ekipy = useDict('ekipa');
  const [od, setOd] = useF('od', `${rok}-01`);
  const [doo, setDo] = useF('do', today().slice(0, 7));
  const [branza, setBranza] = useF('branza', ALL);
  const [ekipa, setEkipa] = useF('ekipa', ALL);
  const [wg, setWg] = useF('wg', 'faktura');
  const [q, setQ] = useF('q', '');
  const [sel, setSel] = useState<string | null>(null);
  const klient = useMemo(() => new Map(clients.map((c) => [c.id as string, c.nazwa as string])), [clients]);

  const wszystkie = useMemo(() => wynikiOkresu(jobs, revenues, entries, koszt, czas, {
    od: od || '0000-00', do: doo || '9999-99', wg,
    zamkniete: (j) => grupa(j.status as string) === 'zamkniete' || j.status === 'Do rozliczenia',
    godzDnia: (m) => parametryMiesiaca(parametry, m).godzDnia,
  }), [jobs, revenues, entries, koszt, czas, od, doo, wg, grupa, parametry]);
  const list = useMemo(() => wszystkie.filter((r) => (branza === ALL || r.job.kategoria === branza) && (ekipa === ALL || r.job.ekipa === ekipa)
    && (!q || matches(q, r.job.numer as string, klient.get(r.job.clientId as string)))), [wszystkie, branza, ekipa, q, klient]);
  const { rows, by } = useSort(list, { nr: (r) => r.job.numer, klient: (r) => klient.get(r.job.clientId as string), kat: (r) => r.job.kategoria, mc: (r) => r.miesiac, dni: (r) => r.roboczodni,
    p: (r) => r.przychod, m: (r) => r.materialy, rob: (r) => r.robocizna, w: (r) => r.wynik, marza: (r) => r.marza ?? -99, nd: (r) => r.naDzien ?? -1e12 });
  const s = useMemo(() => {
    const t = list.reduce((a, r) => ({ p: a.p + r.przychod, m: a.m + r.materialy, rob: a.rob + r.robocizna, w: a.w + r.wynik, d: a.d + r.roboczodni }), { p: 0, m: 0, rob: 0, w: 0, d: 0 });
    return { ...t, marza: t.p ? t.w / t.p : null, nd: t.d ? t.w / t.d : null };
  }, [list]);
  const wybrane = list.find((r) => r.job.id === sel);
  const nazwa = (r: WierszZlecenia) => klient.get(r.job.clientId as string) ?? r.job.numer;
  const toggle = (id: string) => setSel(sel === id ? null : id);

  const filtry = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full grid-cols-2 gap-3 desk:flex desk:w-auto">
        <label className="grid gap-1 text-sm font-semibold">Od miesiąca<Input type="month" className="w-full desk:w-48" value={od} onChange={(e) => setOd(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Do miesiąca<Input type="month" className="w-full desk:w-48" value={doo} onChange={(e) => setDo(e.target.value)} /></label>
      </div>
      <div className="w-48"><Select aria-label="Branża" value={branza} onValueChange={setBranza} options={[{ value: ALL, label: 'Wszystkie branże' }, ...branze.map((b) => ({ value: b.wartosc as string, label: b.wartosc as string }))]} /></div>
      <div className="w-48"><Select aria-label="Ekipa" value={ekipa} onValueChange={setEkipa} options={[{ value: ALL, label: 'Wszystkie ekipy' }, ...ekipy.map((b) => ({ value: b.wartosc as string, label: b.wartosc as string }))]} /></div>
      <div className="w-56"><Select aria-label="Miesiąc zlecenia wg" value={wg} onValueChange={(v) => setWg(v as 'faktura' | 'praca')} options={[{ value: 'faktura', label: 'Miesiąc wg faktury' }, { value: 'praca', label: 'Miesiąc wg ostatniego dnia pracy' }]} /></div>
      <div className="w-full desk:w-72"><Search value={q} onChange={setQ} label="Szukaj zlecenia" placeholder="Klient, numer" /></div>
    </div>
  );
  const kafelki = (
    <dl className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 desk:grid-cols-7">
      <Kafel l="Zleceń" v={String(list.length)} s={`w tym bez faktury: ${list.filter((r) => r.bezFaktury).length}`} />
      <Kafel l="Przychód netto" v={`${zl0(s.p)} zł`} />
      <Kafel l="Materiały" v={`${zl0(s.m)} zł`} s={s.p ? `${proc(s.m / s.p)} przychodu` : undefined} />
      <Kafel l="Robocizna" v={`${zl0(s.rob)} zł`} s={s.p ? `${proc(s.rob / s.p)} przychodu` : undefined} />
      <Kafel l="Wynik" v={`${zl0(s.w)} zł`} tone={s.w < 0 ? 'danger' : 'ok'} />
      <Kafel l="Średnia marża" v={proc(s.marza)} />
      <Kafel l="Roboczodni" v={dn(s.d)} s={s.nd === null ? undefined : `wynik na dzień: ${zl0(s.nd)} zł`} />
    </dl>
  );

  if (!wszystkie.length) return <div className="grid gap-4">{filtry}<Empty icon={Briefcase} title="Brak zleceń w tym okresie" hint="Liczą się zlecenia z fakturą (przychodem przy zleceniu) w wybranych miesiącach i zlecenia zakończone bez faktury." /></div>;
  return (
    <div className="grid gap-4">
      {filtry}
      {kafelki}
      {desk ? (
        <div className={cn('grid items-start gap-4', wybrane && 'grid-cols-[minmax(0,1fr)_400px]')}>
          <Table aria-label="Wyniki zleceń">
            <thead><tr>
              <Th sort={by('kat')} className="w-12" pad="pl-2 pr-2.5"><span className="sr-only">Branża</span></Th><Th sort={by('nr')} className="w-[6rem]">Zlecenie</Th><Th sort={by('klient')}>Klient</Th>
              {!wybrane && <Th sort={by('mc')} className="w-[5.5rem]">Miesiąc</Th>}<Th sort={by('dni')} num className="w-[6.5rem]">Roboczodni</Th>
              <Th sort={by('p')} num className="w-[7rem]">Przychód</Th>{!wybrane && <><Th sort={by('m')} num className="w-[7rem]">Materiały</Th><Th sort={by('rob')} num className="w-[7rem]">Robocizna</Th></>}
              <Th sort={by('w')} num className="w-[7rem]">Wynik</Th><Th sort={by('marza')} num className="w-[5rem]">Marża</Th><Th sort={by('nd')} num className="w-[7rem]">Wynik / dzień</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.job.id} onOpen={() => toggle(r.job.id as string)} selected={sel === r.job.id}>{/* przy otwartym panelu bez Miesiąca, Materiałów i Robocizny (są w panelu) */}
                  <Td pad="pr-2.5 py-1.5">{r.job.kategoria ? <CatTab name={r.job.kategoria} flush /> : null}</Td>
                  <Td><button type="button" onClick={() => toggle(r.job.id as string)} aria-pressed={sel === r.job.id} className="font-semibold hover:text-action">{r.job.numer}</button></Td>
                  <Td title={nazwa(r)}>{nazwa(r)}</Td>
                  {!wybrane && <Td>{mies(r.miesiac)}</Td>}
                  <Td num>{dn(r.roboczodni)}</Td>
                  <Td num>{r.bezFaktury ? <span className="rounded-[3px] bg-danger/10 px-1.5 py-0.5 text-xs font-bold text-danger">brak faktury</span> : zl0(r.przychod)}</Td>
                  {!wybrane && <><Td num className="text-ink-2">{zl0(r.materialy)}</Td><Td num className="text-ink-2">{zl0(r.robocizna)}</Td></>}
                  <Td num className={cn('font-semibold', r.wynik < 0 && 'text-danger')}>{zl0(r.wynik)}</Td>
                  <Td num className={cn(r.wynik < 0 && 'text-danger')}>{proc(r.marza)}</Td>
                  <Td num className={cn(r.naDzien !== null && r.naDzien < 0 && 'text-danger')}>{r.naDzien === null ? '—' : zl0(r.naDzien)}</Td>
                </Tr>
              ))}
              <tr className="bg-bg/60 font-bold">
                <Td colSpan={wybrane ? 3 : 4}>RAZEM</Td><Td num>{dn(s.d)}</Td><Td num>{zl0(s.p)}</Td>{!wybrane && <><Td num>{zl0(s.m)}</Td><Td num>{zl0(s.rob)}</Td></>}
                <Td num className={cn(s.w < 0 && 'text-danger')}>{zl0(s.w)}</Td><Td num>{proc(s.marza)}</Td><Td num>{s.nd === null ? '—' : zl0(s.nd)}</Td>
              </tr>
            </tbody>
          </Table>
          {wybrane && <div className="sticky top-16"><Szczegoly r={wybrane} nazwa={nazwa(wybrane)} onClose={() => setSel(null)} /></div>}
        </div>
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.job.id} className={cn('rounded-[4px] border bg-card', sel === r.job.id ? 'border-2 border-action' : 'border-line')}>
              <button type="button" onClick={() => toggle(r.job.id as string)} aria-expanded={sel === r.job.id} className="grid w-full gap-1 p-4 text-left">
                <span className="flex items-center gap-2">{r.job.kategoria && <CatTab name={r.job.kategoria} />}<span className="min-w-0 flex-1 truncate font-bold">{nazwa(r)}</span><span className="text-sm text-ink-2">{r.job.numer} · {mies(r.miesiac)}</span></span>
                <span className="flex flex-wrap justify-between gap-x-4 text-sm tabular-nums">
                  <span>{dn(r.roboczodni)} dni · {r.bezFaktury ? <b className="text-danger">brak faktury</b> : `przychód ${zl0(r.przychod)}`}</span>
                  <b className={cn(r.wynik < 0 && 'text-danger')}>{zl0(r.wynik)} · {proc(r.marza)}</b>
                </span>
              </button>
              {sel === r.job.id && <div className="border-t border-rule p-4 pt-3"><Szczegoly r={r} nazwa={nazwa(r)} /></div>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 desk:grid-cols-2">
        <Wykres title="Marża wg branży" opis="Średnia marża zleceń w wybranym okresie dla każdej branży">
          <Poziome rows={marzaBranz(list).map((b) => ({ name: `${b.k} (${b.n})`, v: Math.max(0, Math.round((b.marza ?? 0) * 100)), label: proc(b.marza), color: kolor(b.k) ?? 'var(--field)' }))} fmt={(v) => `${v}%`} />
        </Wykres>
        <Wykres title="Wynik na roboczodzień" opis="Każda kropka to zlecenie: w poziomie roboczodni, w pionie wynik na jeden roboczodzień; czerwone – strata">
          <Rozrzut rows={list} nazwa={nazwa} sel={sel} onPick={toggle} />
        </Wykres>
      </div>
    </div>
  );
}

function Kafel({ l, v, s, tone }: { l: string; v: string; s?: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="rounded-[4px] border border-line bg-card px-3 py-2.5">
      <dt className="text-xs text-ink-2">{l}</dt>
      <dd className={cn('text-xl font-extrabold tabular-nums', tone === 'ok' && 'text-ok', tone === 'danger' && 'text-danger')}>{v}</dd>
      {s && <dd className="text-xs text-ink-2">{s}</dd>}
    </div>
  );
}

const marzaBranz = (list: WierszZlecenia[]) => {
  const m = new Map<string, { p: number; w: number; n: number }>();
  for (const r of list) { if (r.bezFaktury) continue; const k = (r.job.kategoria as string) || 'Bez branży'; const v = m.get(k) ?? { p: 0, w: 0, n: 0 }; v.p += r.przychod; v.w += r.wynik; v.n++; m.set(k, v); }
  return [...m].map(([k, v]) => ({ k, n: v.n, marza: v.p ? v.w / v.p : null })).sort((a, b) => (b.marza ?? -9) - (a.marza ?? -9));
};

/** Rozrzut: roboczodni × wynik na dzień; klik w kropkę = wybór zlecenia. */
function Rozrzut({ rows, nazwa, sel, onPick }: { rows: WierszZlecenia[]; nazwa: (r: WierszZlecenia) => string; sel: string | null; onPick: (id: string) => void }) {
  const pts = rows.filter((r) => r.naDzien !== null);
  const W = 720, H = 260, L = 64, B = 30, T = 10, R = 12;
  const maxX = Math.max(1, ...pts.map((r) => r.roboczodni)), ys = pts.map((r) => r.naDzien!), maxY = Math.max(0, ...ys), minY = Math.min(0, ...ys);
  const x = (v: number) => L + (W - L - R) * v / maxX, y = (v: number) => T + (H - T - B) * (maxY - v) / (maxY - minY || 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-2" style={{ maxHeight: H }}>
      {[maxY, (maxY + minY) / 2, minY].map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill="currentColor">{zl0(t)}</text></g>)}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--ink)" />
      {[0, maxX / 2, maxX].map((t, i) => <text key={i} x={x(t)} y={H - 10} textAnchor="middle" fontSize="13" fill="currentColor">{dn(t)} dni</text>)}
      {pts.map((r) => (
        <circle key={r.job.id} cx={x(r.roboczodni)} cy={y(r.naDzien!)} r={sel === r.job.id ? 8 : 6} fill={r.naDzien! < 0 ? C.strata : C.wynik} fillOpacity={0.8} stroke={sel === r.job.id ? 'var(--ink)' : 'var(--card)'} strokeWidth="2"
          className="cursor-pointer" onClick={() => onPick(r.job.id as string)} data-tip={`${r.job.numer} ${nazwa(r)}\n${dn(r.roboczodni)} dni · wynik ${zl0(r.wynik)} zł\nna dzień: ${zl0(r.naDzien!)} zł`} />
      ))}
    </svg>
  );
}

/** Panel zlecenia: od przychodu do wyniku, robocizna wg osób, dni pracy w czasie, faktury, link do karty. */
function Szczegoly({ r, nazwa, onClose }: { r: WierszZlecenia; nazwa: string; onClose?: () => void }) {
  const people = useEntities('schedule_people'), revenues = useEntities('revenues'), entries = useEntities('schedule_entries'), czas = useEntities('time_entries');
  const parametry = useParametry() ?? {};
  const kto = (id: string) => people.find((p) => p.id === id)?.nazwa ?? '?';
  const osoby = useMemo(() => {
    const m = new Map<string, { dni: number; h: number; koszt: number }>();
    for (const x of r.pozycje) { const v = m.get(x.personId) ?? { dni: 0, h: 0, koszt: 0 }; v.dni += x.dni; v.h += x.godziny; v.koszt += x.koszt; m.set(x.personId, v); }
    return [...m].sort((a, b) => b[1].koszt - a[1].koszt);
  }, [r]);
  // dni pracy: wpisy harmonogramu (½ dnia = 0,5) i godziny z Czasomierza ÷ godziny dnia
  const dni = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (!e.deletedAt && e.jobId === r.job.id) m.set(e.dzien, (m.get(e.dzien) ?? 0) + (e.polDnia ? 0.5 : 1));
    for (const e of czas) if (!e.deletedAt && e.do && e.jobId === r.job.id) m.set(e.dzien, (m.get(e.dzien) ?? 0) + (Date.parse(e.do) - Date.parse(e.od)) / 3_600_000 / parametryMiesiaca(parametry, String(e.dzien).slice(0, 7)).godzDnia);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries, czas, r.job.id, parametry]);
  const faktury = revenues.filter((x) => !x.deletedAt && x.jobId === r.job.id);
  const opis = [r.job.kategoria, r.job.krotkiOpis, r.pierwszyDzien && `${dayShort(r.pierwszyDzien)}${r.ostatniDzien && r.ostatniDzien !== r.pierwszyDzien ? ` – ${dayShort(r.ostatniDzien)}` : ''}`].filter(Boolean).join(' · ');
  return (
    <section aria-label={`Wynik zlecenia ${r.job.numer}`} className={cn('grid gap-4', onClose && 'rounded-[4px] border border-line bg-card p-4')}>
      {onClose && <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-lg font-extrabold">{r.job.numer} · {nazwa}</h3><p className="text-sm text-ink-2">{opis}</p></div>
        <Button variant="ghost" size="icon" className="-mt-2 -mr-2 shrink-0" aria-label="Zamknij" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>}
      {!onClose && opis && <p className="text-sm text-ink-2">{opis}</p>}
      <div role="img" aria-label={`Przychód ${zl0(r.przychod)} zł, materiały ${zl0(r.materialy)} zł, robocizna ${zl0(r.robocizna)} zł, wynik ${zl0(r.wynik)} zł`}><Tips><Kaskada r={r} /></Tips></div>
      {osoby.length > 0 && <div className="grid gap-2"><h4 className="font-bold">Robocizna wg osób</h4>
        <Tips><ul className="grid gap-1.5">{osoby.map(([id, v]) => {
          const max = osoby[0]![1].koszt || 1;
          return (
            <li key={id} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
              <span className="truncate font-semibold">{kto(id)}</span>
              <span className="h-3.5 rounded-r-[3px]" style={{ width: `${(v.koszt / max) * 100}%`, minWidth: 2, background: C.rob }} data-tip={`${kto(id)}\n${fmtZl(Math.round(v.koszt))}`} />
              <span className="tabular-nums text-ink-2">{[v.dni ? `${dn(v.dni)} dni` : '', v.h ? fmtMinuty(v.h * 60) : ''].filter(Boolean).join(' + ')} · {zl0(v.koszt)} zł</span>
            </li>);
        })}</ul></Tips></div>}
      {dni.length > 0 && <div className="grid gap-2"><h4 className="font-bold">Dni pracy w czasie</h4><Tips><Dni dni={dni} /></Tips></div>}
      {faktury.length > 0 && <p className="text-sm text-ink-2">Faktury: {faktury.map((f) => `${f.nrFaktury || SPOSOB_LABEL[f.sposob as Sposob]} · ${fmtZl(f.nettoGr as number)} netto`).join('; ')}</p>}
      {r.bezFaktury && <p className="text-sm font-semibold text-danger">Brak faktury przy zleceniu – przychód 0 zł.</p>}
      <a href={`#zl/${r.job.id}`} className="inline-flex items-center gap-2 font-bold text-action hover:underline">Otwórz kartę zlecenia<ArrowRight className="h-4 w-4" /></a>
    </section>
  );
}

/** Od przychodu do wyniku: przychód, − materiały, − robocizna (pływające słupki), wynik. */
function Kaskada({ r }: { r: WierszZlecenia }) {
  const W = 400, H = 190, B = 24, T = 20, max = Math.max(r.przychod, r.przychod - r.materialy, r.wynik, 1), min = Math.min(0, r.wynik, r.przychod - r.materialy - r.robocizna);
  const y = (v: number) => T + (H - T - B) * (max - v) / (max - min || 1);
  const cols = [
    { n: 'Przychód', a: 0, b: r.przychod, c: C.przychod, v: r.przychod },
    { n: 'Materiały', a: r.przychod - r.materialy, b: r.przychod, c: C.mat, v: -r.materialy },
    { n: 'Robocizna', a: r.przychod - r.materialy - r.robocizna, b: r.przychod - r.materialy, c: C.rob, v: -r.robocizna },
    { n: 'Wynik', a: Math.min(0, r.wynik), b: Math.max(0, r.wynik), c: r.wynik < 0 ? C.strata : C.wynik, v: r.wynik },
  ];
  const slot = W / cols.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-2" style={{ maxHeight: H }}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--ink)" />
      {cols.map((c, i) => {
        const top = y(Math.max(c.a, c.b)), bot = y(Math.min(c.a, c.b));
        return (
          <g key={c.n}>
            <rect x={i * slot + slot * 0.15} y={top} width={slot * 0.7} height={Math.max(bot - top, 1)} rx="2" fill={c.c} data-tip={`${c.n}: ${fmtZl(Math.round(c.v))}`} />
            <text x={i * slot + slot / 2} y={top - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">{zl0(c.v)}</text>
            <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="13" fill="currentColor">{c.n}{c.n === 'Wynik' && r.marza !== null ? ` ${proc(r.marza)}` : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Słupki dni od pierwszego do ostatniego dnia pracy (puste dni bez słupka). */
function Dni({ dni }: { dni: [string, number][] }) {
  const first = dni[0]![0], last = dni.at(-1)![0];
  const all: string[] = [];
  for (let d = first; d <= last && all.length < 120; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) all.push(d);
  const v = new Map(dni), max = Math.max(...dni.map((x) => x[1]), 1);
  const W = 400, H = 90, B = 20, slot = W / all.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-2" style={{ maxHeight: H }}>
      <line x1={0} x2={W} y1={H - B} y2={H - B} stroke="var(--line)" />
      {all.map((d, i) => v.get(d) ? <rect key={d} x={i * slot + slot * 0.1} y={(H - B) * (1 - v.get(d)! / max)} width={Math.max(slot * 0.8, 1)} height={(H - B) * v.get(d)! / max} rx="1.5" fill="var(--action)" data-tip={`${dayShort(d)}\n${dn(v.get(d)!)} osobodni`} /> : null)}
      <text x={0} y={H - 4} fontSize="12" fill="currentColor">{dayShort(first)}</text>
      <text x={W} y={H - 4} textAnchor="end" fontSize="12" fill="currentColor">{dayShort(last)}</text>
    </svg>
  );
}
