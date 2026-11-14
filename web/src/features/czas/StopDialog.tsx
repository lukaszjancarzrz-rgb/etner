import { chwilaPl, fmtMinuty, godzinaPl, minutyMiedzy } from '@etner/shared';
import { useState } from 'react';
import { fmtDay, useMe } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { useOpisZlecenia } from './dane.js';
import { hhmm } from './model.js';
import { stop } from './zapis.js';

/** „Zakończyć pracę?”: potwierdzenie z możliwością poprawy godzin (C2). */
export default function StopDialog({ entry, onClose }: { entry: Rec; onClose: () => void }) {
  const me = useMe();
  const opis = useOpisZlecenia()(entry.jobId);
  const [teraz] = useState(() => new Date().toISOString());
  const od0 = hhmm(entry.od), do0 = hhmm(teraz);
  const [od, setOd] = useState(od0);
  const [doo, setDoo] = useState(do0);
  const [kom, setKom] = useState('');
  const zmiana = od !== od0 || doo !== do0;
  const odIso = od !== od0 ? chwilaPl(entry.dzien, od || od0) : entry.od;
  const doIso = doo !== do0 ? chwilaPl(entry.dzien, doo || do0) : teraz;
  const min = minutyMiedzy(odIso, doIso);
  const err = !od || !doo ? 'Wpisz obie godziny.' : zmiana && min <= 0 ? 'Godzina zakończenia musi być późniejsza niż rozpoczęcia (praca przez północ: biuro).' : '';
  const zapisz = () => {
    if (err || !me) return;
    stop(me.id, { ...(od !== od0 && { od: odIso }), ...(doo !== do0 && { do: doIso }), ...(zmiana && kom.trim() && { komentarz: kom.trim() }) });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Zakończyć pracę?" description={`${opis.klient}${opis.opis ? ` · ${opis.opis}` : ''} · ${fmtDay(entry.dzien)}`}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">{(id) => <Input id={id} type="time" value={od} onChange={(e) => setOd(e.target.value)} aria-invalid={!!err || undefined} />}</Field>
            <Field label="Stop">{(id) => <Input id={id} type="time" value={doo} onChange={(e) => setDoo(e.target.value)} aria-invalid={!!err || undefined} />}</Field>
          </div>
          <div className="rounded-[4px] border border-line px-4 py-3 text-center" role="status">
            <p className="text-sm text-ink-2">Razem</p>
            <p className="text-3xl font-extrabold tabular-nums">{fmtMinuty(min)}</p>
          </div>
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          <p className="text-sm text-ink-2">Możesz poprawić godziny, jeśli kliknąłeś za późno. Poprawka będzie widoczna dla biura (z godzinami z czasomierza: start {godzinaPl(entry.od)}).</p>
          {zmiana && <Field label="Komentarz (opcjonalnie)">{(id) => <Textarea id={id} value={kom} maxLength={300} onChange={(e) => setKom(e.target.value)} className="min-h-16" />}</Field>}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={onClose}>Wróć</Button>
            <Button onClick={zapisz} disabled={!!err}>Zapisz i zakończ</Button>
          </div>
        </div>
      </Sheet>
    </Dialog>
  );
}
