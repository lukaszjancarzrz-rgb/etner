import { FileXls, Percent } from '@phosphor-icons/react';
import { parametryMiesiaca, type Parametry } from '@etner/shared';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../core/api.js';
import { today } from '../../core/data.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { setParametry, useParametry } from '../place/dane.js';
import { Card } from './card.js';

type Wynik = { rok: number; osoby: number; stawki: number; miesiace: number; wpisy: number; ostrzezenia: string[] };
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');

/** Jednorazowe przeniesienie Płac z arkusza (próba, potem zapis). */
export function PlaceUstawienia() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [w, setW] = useState<(Wynik & { naprawde: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(f: File, naprawde: boolean) {
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.set('plik', f);
    try {
      setW({ ...(await api<Wynik>(`/api/payroll/import-xlsx${naprawde ? '?naprawde=1' : ''}`, { method: 'POST', body: fd })), naprawde });
      if (naprawde) { setFile(null); api<Record<string, Parametry>>('/api/settings/place').then(setParametry, () => {}); }
    } catch (e) { setErr(e instanceof ApiError && e.status === 409 ? 'W Płacach są już dane – przeniesienie jest tylko do pustej bazy.' : msg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Płace z arkusza" icon={FileXls} hint="Jednorazowo, do pustych Płac: pracownicy, stawki, godziny, zaliczki i parametry z arkusza (.xlsx). Najpierw próba bez zapisu.">
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden data-testid="place-file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFile(f); setW(null); void send(f, false); } }} />
      {!w?.naprawde && <div><Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><FileXls className="h-5 w-5" />{busy && !w ? 'Sprawdzanie…' : file ? 'Wybierz inny plik' : 'Wybierz plik i sprawdź'}</Button></div>}
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      {w && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold" role="status">
            {w.naprawde ? 'Dane przeniesione.' : `Próba z pliku ${file?.name ?? ''}: baza bez zmian.`} Rok {w.rok}: osoby {w.osoby}, stawki {w.stawki}, miesiące z danymi {w.miesiace}, zaliczki i dodatki {w.wpisy}.
          </p>
          {w.ostrzezenia.length > 0 && <ul className="list-disc pl-5 text-sm text-ink-2">{w.ostrzezenia.map((o) => <li key={o}>{o}</li>)}</ul>}
          {!w.naprawde && file && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void send(file, true)}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setW(null); }}>Anuluj</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// pola parametrów: % = ułamek pokazywany w procentach, zł = grosze, n = liczba
const POLA: [keyof Parametry, string, '%' | 'zł' | 'n'][] = [
  ['placaMinGr', 'Płaca minimalna (zł/mies.)', 'zł'], ['emP', 'Emerytalna – pracownik (%)', '%'], ['rentP', 'Rentowa – pracownik (%)', '%'], ['chor', 'Chorobowa (%)', '%'],
  ['zdr', 'Zdrowotna (%)', '%'], ['pit', 'Zaliczka PIT (%)', '%'], ['kwotaZmnGr', 'Kwota zmniejszająca podatek (zł/mies.)', 'zł'], ['kupGr', 'Koszty uzyskania – umowa o pracę (zł/mies.)', 'zł'],
  ['kupZl', 'Koszty uzyskania – zlecenie (%)', '%'], ['emF', 'Emerytalna – pracodawca (%)', '%'], ['rentF', 'Rentowa – pracodawca (%)', '%'], ['wyp', 'Wypadkowa (%)', '%'],
  ['fp', 'Fundusz Pracy (%)', '%'], ['fgsp', 'FGŚP (%)', '%'], ['godzDnia', 'Godziny w dniu pracy', 'n'], ['urlopMin', 'Urlop ustawowy – staż < 10 lat (dni)', 'n'],
  ['urlopMax', 'Urlop ustawowy – staż ≥ 10 lat (dni)', 'n'], ['godzUrlop', 'Godziny płatne za 1 dzień urlopu', 'n'],
];
const pokaz = (v: number, j: '%' | 'zł' | 'n') => String(j === '%' ? +(v * 100).toFixed(4) : j === 'zł' ? v / 100 : v).replace('.', ',');

let kolejka = Promise.resolve();

/** Parametry płac na rok (ZUS, PIT, urlopy); zapis po wyjściu z pola. Rok bez własnych parametrów bierze je z poprzedniego. */
export function ParametryPlac() {
  const rok = today().slice(0, 4);
  const mapa = useParametry();
  const [err, setErr] = useState('');
  const ost = useRef(mapa);
  ost.current = mapa;
  if (!mapa) return null;
  const p = parametryMiesiaca(mapa, rok);
  // zapisy po kolei, każdy od najnowszych parametrów (dwa pola zmienione szybko po sobie)
  const zapisz = (k: keyof Parametry, t: string, j: '%' | 'zł' | 'n') => { kolejka = kolejka.then(() => zapisz1(k, t, j)); };
  async function zapisz1(k: keyof Parametry, t: string, j: '%' | 'zł' | 'n') {
    const p = parametryMiesiaca(ost.current ?? {}, rok);
    const n = Number(t.replace(',', '.').replace(/\s/g, ''));
    if (!t.trim() || !Number.isFinite(n) || n < 0) return setErr('Wpisz liczbę.');
    const v = j === '%' ? +(n / 100).toFixed(6) : j === 'zł' ? Math.round(n * 100) : n; // 9,76/100 ≠ 0,0976 w liczbach zmiennoprzecinkowych
    if (v === p[k]) return setErr('');
    try { const m = await api<Record<string, Parametry>>('/api/settings/place', { method: 'PUT', json: { [rok]: { ...p, [k]: v } } }); ost.current = m; setParametry(m); setErr(''); }
    catch (e) { setErr(msg(e)); }
  }
  return (
    <Card title={`Parametry płac ${rok}`} icon={Percent} hint="Stawki ZUS i PIT, płaca minimalna, urlopy. Zmieniaj tylko, gdy zmienią się przepisy.">
      {err && <p role="alert" className="text-danger">{err}</p>}
      <div className="grid gap-3 min-[700px]:grid-cols-2 desk:grid-cols-3">
        {POLA.map(([k, label, j]) => <Field key={`${k}${p[k]}`} label={label}>{(id) => <Input id={id} inputMode="decimal" defaultValue={pokaz(p[k], j)} onBlur={(e) => zapisz(k, e.target.value, j)} />}</Field>)}
      </div>
    </Card>
  );
}
