import { FileXls } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
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
      if (naprawde) setFile(null);
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
