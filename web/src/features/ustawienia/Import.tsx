import { Copy, FileXls, Warning } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { toast } from '../../core/ui/toast.js';
import { Card } from './card.js';

type Wiersz = { co: string; zrodlo: number | null; baza: number; pominiete: number; roznica: number | null };
type Wynik = { naprawde: boolean; wiersze: Wiersz[]; doPrzejrzenia: number; konta: { nazwa: string; login: string; haslo: string }[] };

/** Przeniesienie ze starego arkusza bez terminala (R53): próba z raportem, potem „Przenieś naprawdę”; hasła startowe tylko w pamięci tego ekranu. */
export function Import() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [wynik, setWynik] = useState<Wynik | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(f: File, naprawde: boolean) {
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.set('file', f);
    try {
      setWynik(await api<Wynik>(`/api/migration-import${naprawde ? '?naprawde=1' : ''}`, { method: 'POST', body: fd }));
      if (naprawde) setFile(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');
    } finally { setBusy(false); }
  }
  const pick = (f: File | undefined) => { if (!f) return; setFile(f); setWynik(null); void send(f, false); };
  const reset = () => { setFile(null); setWynik(null); setErr(''); };
  const hasla = wynik?.naprawde ? wynik.konta.filter((k) => k.haslo) : [];
  const copy = () => navigator.clipboard.writeText(hasla.map((k) => `${k.nazwa}: login ${k.login}, hasło ${k.haslo}`).join('\n'))
    .then(() => toast('Skopiowano', { tone: 'ok' }), () => toast('Nie udało się skopiować', { tone: 'error' }));
  const bad = wynik?.wiersze.filter((w) => w.roznica !== null && w.roznica !== 0).length ?? 0;

  return (
    <Card title="Przeniesienie z arkusza" icon={FileXls}
      hint="Jednorazowo, do nowej bazy: dane ze starego arkusza firmy (.xlsx, do 10 MB). Najpierw próba z raportem – nic się nie zapisuje. Plik nie jest nigdzie przechowywany.">
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="import-file" />
      {!wynik?.naprawde && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <FileXls className="h-5 w-5" />{busy && !wynik ? 'Sprawdzanie…' : file ? 'Wybierz inny plik' : 'Wybierz plik i sprawdź'}
          </Button>
        </div>
      )}
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      {wynik && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold" role="status">
            {wynik.naprawde ? 'Dane przeniesione.' : `Próba z pliku ${file?.name ?? ''}: baza bez zmian.`}{' '}
            Do przejrzenia: {wynik.doPrzejrzenia} {wynik.doPrzejrzenia === 1 ? 'pozycja' : 'pozycji'}{wynik.naprawde ? ' (lista niżej).' : '.'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Raport przeniesienia">
              <thead className="text-xs text-ink-2">
                <tr>
                  <th className="py-1 pr-2 text-left font-semibold">Co</th><th className="px-1.5 text-right font-semibold">Arkusz</th><th className="px-1.5 text-right font-semibold">Baza</th>
                  <th className="px-1.5 text-right font-semibold"><abbr title="Pominięte" className="no-underline">Pomin.</abbr></th><th className="pl-1.5 text-right font-semibold"><abbr title="Różnica" className="no-underline">Różn.</abbr></th>
                </tr>
              </thead>
              <tbody>
                {wynik.wiersze.map((w) => (
                  <tr key={w.co} className={cn('border-t border-line', w.roznica ? 'font-semibold text-danger' : '')}>
                    <td className="py-1 pr-2">{w.co}</td>
                    <td className="px-1.5 text-right tabular-nums">{w.zrodlo ?? '–'}</td>
                    <td className="px-1.5 text-right tabular-nums">{w.baza}</td>
                    <td className="px-1.5 text-right tabular-nums">{w.pominiete}</td>
                    <td className="pl-1.5 text-right tabular-nums">{w.roznica ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bad > 0 && <p className="flex items-start gap-2 text-sm text-danger"><Warning className="mt-0.5 h-4 w-4 shrink-0" />Różnica arkusz – baza w {bad} {bad === 1 ? 'wierszu' : 'wierszach'} raportu. Nie przenoś, zgłoś to.</p>}
          {!wynik.naprawde && wynik.konta.length > 0 && (
            <p className="text-sm text-ink-2">Konta pracowników do założenia: {wynik.konta.map((k) => `${k.nazwa} (${k.login})`).join(', ')}.</p>
          )}
          {!wynik.naprawde && file && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void send(file, true)}>{busy ? 'Przenoszenie…' : 'Przenieś naprawdę'}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>Anuluj</Button>
            </div>
          )}
          {hasla.length > 0 && (
            <div className="grid gap-2 rounded-xl border border-action/40 bg-action/5 p-3">
              <p className="text-sm font-semibold">Hasła startowe pracowników są widoczne tylko teraz. Skopiuj je albo przepisz i przekaż każdemu osobiście; po wyjściu z tego ekranu nie da się ich odczytać (można tylko ustawić nowe w Użytkownikach).</p>
              <ul className="grid gap-1 text-sm" aria-label="Hasła startowe">
                {hasla.map((k) => <li key={k.login}>{k.nazwa}: login <span className="font-mono font-semibold">{k.login}</span>, hasło <span className="font-mono font-semibold">{k.haslo}</span></li>)}
              </ul>
              <div><Button size="sm" variant="secondary" onClick={() => void copy()}><Copy className="h-4 w-4" />Kopiuj wszystkie</Button></div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
