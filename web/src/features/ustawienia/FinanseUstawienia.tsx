import { SPOSOBY, SPOSOB_LABEL, type Sposob } from '@etner/shared';
import { Coins, FileXls } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { parseZl } from '../leady/model.js';
import { setStawka } from '../finanse/stawka.js';
import { ApiError, api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { toast } from '../../core/ui/toast.js';
import { Card } from './card.js';

type Ust = { autoPrzychod: boolean; domyslnySposob: Sposob; stawkaOsobodniaGr: number };
type Wynik = { przychody: number; dopasowane: number; doPrzejrzenia: number; koszty: number; kpirMiesiace: number };
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');

/** Finanse: przełączniki przychodu ze zlecenia oraz jednorazowe przeniesienie przychodów i kosztów z arkusza (próba, potem zapis). */
export function FinanseUstawienia() {
  const [u, setU] = useState<Ust | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [w, setW] = useState<(Wynik & { naprawde: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api<Ust>('/api/settings/finanse').then(setU, (e) => setErr(msg(e))); }, []);

  const save = (p: Partial<Ust>) => {
    if (!u) return;
    const n = { ...u, ...p };
    setU(n);
    api('/api/settings/finanse', { method: 'PUT', json: n }).catch((e) => { setU(u); toast('Nie zapisano', { body: msg(e), tone: 'error' }); });
  };
  async function send(f: File, naprawde: boolean) {
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.set('plik', f);
    try {
      setW({ ...(await api<Wynik>(`/api/finanse/import-xlsx${naprawde ? '?naprawde=1' : ''}`, { method: 'POST', body: fd })), naprawde });
      if (naprawde) setFile(null);
    } catch (e) { setErr(e instanceof ApiError && e.status === 409 ? 'W Finansach są już dane – przeniesienie jest tylko do pustej bazy.' : msg(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card title="Finanse" icon={Coins} hint="Przychód ze zlecenia po jego rozliczeniu i domyślny sposób rozliczenia w formularzu przychodu.">
        {u && (
          <div className="grid gap-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
              <Checkbox checked={u.autoPrzychod} onCheckedChange={(v) => save({ autoPrzychod: v === true })} />Dodawaj przychód automatycznie
            </label>
            <Stawka u={u} save={save} />
            <Field label="Domyślny sposób">{(id) => <Select id={id} value={u.domyslnySposob} onValueChange={(v) => save({ domyslnySposob: v as Sposob })} options={SPOSOBY.map((v) => ({ value: v, label: SPOSOB_LABEL[v] }))} />}</Field>
          </div>
        )}
        {!u && err && <p className="text-sm text-danger" role="alert">{err}</p>}
      </Card>
      <Card title="Finanse z arkusza" icon={FileXls} hint="Jednorazowo, do pustych Finansów: przychody i koszty z arkusza (.xlsx). Najpierw próba bez zapisu.">
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden data-testid="finanse-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFile(f); setW(null); void send(f, false); } }} />
        {!w?.naprawde && <div><Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><FileXls className="h-5 w-5" />{busy && !w ? 'Sprawdzanie…' : file ? 'Wybierz inny plik' : 'Wybierz plik i sprawdź'}</Button></div>}
        {err && u && <p className="text-sm text-danger" role="alert">{err}</p>}
        {w && (
          <div className="grid gap-3">
            <p className="text-sm font-semibold" role="status">
              {w.naprawde ? 'Dane przeniesione.' : `Próba z pliku ${file?.name ?? ''}: baza bez zmian.`} Przychody: {w.przychody} (dopasowane do zleceń: {w.dopasowane}, do przejrzenia: {w.doPrzejrzenia}), koszty: {w.koszty}, miesiące KPiR: {w.kpirMiesiace}.
            </p>
            {!w.naprawde && file && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void send(file, true)}>{busy ? 'Przenoszenie…' : 'Przenieś naprawdę'}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setW(null); }}>Anuluj</Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

/** Stawka osobodnia (zł) do szacunku robocizny w wyniku zlecenia (do czasu modułu Płace); zapis po wyjściu z pola. */
function Stawka({ u, save }: { u: Ust; save: (p: Partial<Ust>) => void }) {
  const [t, setT] = useState(u.stawkaOsobodniaGr ? String(u.stawkaOsobodniaGr / 100).replace('.', ',') : '');
  const [err, setErr] = useState('');
  const commit = () => {
    const p = t.trim() ? parseZl(t) : { gr: 0 };
    if ('error' in p) return setErr(p.error);
    setErr(''); if (p.gr !== u.stawkaOsobodniaGr) { save({ stawkaOsobodniaGr: p.gr }); setStawka(p.gr); }
  };
  return <Field label="Stawka osobodnia (zł)" hint="Koszt 1 dnia pracy 1 osoby – do szacunku robocizny w wyniku zlecenia." error={err}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} placeholder="np. 480" />}</Field>;
}
