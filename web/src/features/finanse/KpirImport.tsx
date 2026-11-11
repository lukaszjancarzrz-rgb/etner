import { fmtZl } from '@etner/shared';
import { FileArrowUp, Warning } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';

type Wynik = {
  dodane: number; duplikaty: number; sumy: Record<12 | 13 | 14 | 15, number>; zapisane: Record<12 | 13 | 14 | 15, number>;
  kpir: { towary: number; uboczne: number; wynagrodzenia: number; pozostale: number };
  roznice: { towary: number; uboczne: number; wynagrodzenia: number; pozostale: number };
};
const KOLUMNY = [[12, 'towary', 'Zakup towarów'], [13, 'uboczne', 'Koszty uboczne'], [14, 'wynagrodzenia', 'Wynagrodzenia'], [15, 'pozostale', 'Pozostałe wydatki']] as const;

/** Import miesiąca z KPiR (plik JSON, docs/instrukcje/import-kpir.md): próba bez zapisu, podsumowanie z różnicami, potem „Zapisz”. */
export function KpirImport({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [json, setJson] = useState<unknown>(null);
  const [nazwa, setNazwa] = useState('');
  const [w, setW] = useState<Wynik | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(body: unknown, naprawde: boolean) {
    setBusy(true); setErr('');
    try {
      const r = await api<Wynik>(`/api/costs/kpir-import${naprawde ? '?naprawde=1' : ''}`, { method: 'POST', json: body });
      if (naprawde) { toast('Miesiąc zaimportowany', { body: `Nowe pozycje: ${r.dodane}, pominięte duplikaty: ${r.duplikaty}.`, tone: 'ok' }); onClose(); } else setW(r);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.'); }
    finally { setBusy(false); }
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setW(null); setErr(''); setNazwa(f.name);
    let body: unknown;
    try { body = JSON.parse(await f.text()); } catch { setJson(null); return setErr('To nie jest poprawny plik JSON.'); }
    setJson(body);
    void send(body, false);
  }
  const bad = w ? KOLUMNY.filter(([, k]) => w.roznice[k] !== 0).length : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Importuj miesiąc z KPiR" description="Plik .json przygotowany z PDF-a KPiR. Najpierw próba: nic się nie zapisuje." className="desk:w-[min(640px,92vw)]">
        <div className="grid gap-4">
          <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden data-testid="kpir-file"
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          <div><Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><FileArrowUp className="h-5 w-5" />{busy && !w ? 'Sprawdzanie…' : nazwa ? 'Wybierz inny plik' : 'Wybierz plik'}</Button></div>
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          {w && (
            <>
              <p className="text-sm font-semibold" role="status">Nowe pozycje: {w.dodane}, pominięte duplikaty: {w.duplikaty}.</p>
              <p className="text-xs text-ink-2">„W aplikacji” = wszystkie koszty tego miesiąca po imporcie. Różnica = w aplikacji − KPiR.</p>
              <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums" aria-label="Sumy kolumn KPiR">
                <thead className="text-xs text-ink-2"><tr><th className="py-1 pr-2 text-left font-semibold">Kolumna</th><th className="px-1.5 text-right font-semibold">Plik</th><th className="px-1.5 text-right font-semibold">W aplikacji</th><th className="px-1.5 text-right font-semibold">KPiR</th><th className="pl-1.5 text-right font-semibold">Różnica</th></tr></thead>
                <tbody>
                  {KOLUMNY.map(([n, k, label]) => (
                    <tr key={n} className={cn('border-t border-line', w.roznice[k] !== 0 && 'font-semibold text-danger')}>
                      <td className="py-1 pr-2">{n}. {label}</td><td className="px-1.5 text-right">{fmtZl(w.sumy[n])}</td><td className="px-1.5 text-right">{fmtZl(w.zapisane[n])}</td><td className="px-1.5 text-right">{fmtZl(w.kpir[k])}</td><td className="pl-1.5 text-right">{fmtZl(w.roznice[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {bad > 0 && <p className="flex items-start gap-2 text-sm text-danger"><Warning className="mt-0.5 h-4 w-4 shrink-0" />Różnica w {bad} {bad === 1 ? 'kolumnie' : 'kolumnach'}: koszty miesiąca w aplikacji (po imporcie) nie zgadzają się z KPiR. Sprawdź pominięte duplikaty i koszty dodane ręcznie.</p>}
              <div className="flex justify-end gap-3 border-t border-line pt-4">
                <Button variant="secondary" onClick={onClose}>Anuluj</Button>
                <Button disabled={busy} onClick={() => void send(json, true)}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Dialog>
  );
}
