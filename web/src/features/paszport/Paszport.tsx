import { FolderSimplePlus, IdentificationCard } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { today, useDict, useIsAdmin, useMe } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { catStripe, useCatColor } from '../../core/ui/category.js';
import { Field } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, withoutEchoes } from '../../core/write.js';
import { go } from '../../routes.js';
import { plural, serwisStan, teczkiObiektu, type Teczka } from './model.js';

export const pszHash = (siteId: string, kategoria: string, rest = '') => `#psz/${siteId}/${encodeURIComponent(kategoria)}${rest}`;

/** Teczki obiektu ze sklepu (offline), jak GET /api/sites/:id/teczki. */
export function useTeczki(siteId: string | undefined): Teczka[] {
  const jobs = useEntities('jobs');
  const folders = useEntities('passport_folders');
  const diary = useEntities('diary_entries');
  const scope = useEntities('job_scope_items');
  const attachments = useEntities('attachments');
  const devices = useEntities('devices');
  const service = useEntities('service_entries');
  const kat = useDict('kategoria');
  // plik z kolejki znika, gdy przyjdzie jego wersja z serwera (SSE bywa przed odpowiedzią na zapis)
  return useMemo(() => (siteId ? teczkiObiektu(siteId, { jobs, folders, diary, scope, attachments: withoutEchoes(attachments, ['nazwa', 'rodzaj']), devices, service }, kat.map((k) => k.wartosc)) : []),
    [siteId, jobs, folders, diary, scope, attachments, devices, service, kat]);
}

/** Admin albo autor (P10); serwer sprawdza to samo. */
export const useCanEdit = () => {
  const admin = useIsAdmin(), me = useMe();
  return (authorId: string | null | undefined) => admin || (!!me && authorId === me.id);
};

/** Znacznik terminu serwisu na kafelku i w teczce. */
export function SerwisBadge({ nastepny, soonOnly }: { nastepny?: string | null; soonOnly?: boolean }) {
  const s = serwisStan(nastepny, today());
  return s && !(soonOnly && s.tone === 'later') ? <Badge tone={s.tone === 'later' ? 'line' : 'new'}>{s.label}</Badge> : null;
}

/** Sekcja „Paszport instalacji” obiektu na karcie klienta: kafelki teczek (P3: widoczne także bez paszportu). */
export function PaszportSekcja({ site, label }: { site: Rec; label?: string }) {
  const teczki = useTeczki(site.id);
  const admin = useIsAdmin();
  const cat = useCatColor();
  const [adding, setAdding] = useState(false);
  return (
    <section className="grid gap-2" aria-label={`Paszport instalacji${label ? `: ${label}` : ''}`}>
      <SectionTitle>Paszport instalacji{label && <span className="font-sans text-sm font-semibold text-ink-2">{label}</span>}</SectionTitle>
      <ul className="grid gap-2 min-[560px]:grid-cols-2">
        {teczki.map((t) => {
          const lines = [plural(t.jobIds.length, ['zlecenie', 'zlecenia', 'zleceń']), plural(t.photos.length, ['zdjęcie', 'zdjęcia', 'zdjęć'])];
          return (
            <li key={t.kategoria}>
              <a href={pszHash(site.id, t.kategoria)} className="flex h-full min-h-24 overflow-hidden rounded-2xl border border-line bg-card shadow-card hover:border-ink-2">
                <span className="w-1.5 shrink-0" style={{ background: catStripe(cat(t.kategoria)) }} aria-hidden />
                <span className="grid min-w-0 flex-1 content-start gap-1 px-4 py-3">
                  <span className="font-wide text-lg font-extrabold leading-tight">{t.kategoria}</span>
                  <span className="text-sm text-ink-2">{lines.join(' · ')}</span>
                  <span className="text-sm text-ink-2">{[t.docs.length && plural(t.docs.length, ['dokument', 'dokumenty', 'dokumentów']), t.devices.length && plural(t.devices.length, ['urządzenie', 'urządzenia', 'urządzeń'])].filter(Boolean).join(' · ') || 'bez dokumentów'}</span>
                  {t.nastepnySerwis && <span className="mt-1"><SerwisBadge nastepny={t.nastepnySerwis} /></span>}
                </span>
              </a>
            </li>
          );
        })}
        {admin && (
          <li>
            <button type="button" onClick={() => setAdding(true)} className="grid h-full min-h-24 w-full content-center justify-items-start gap-1 rounded-2xl border-2 border-dashed border-line px-4 py-3 text-left text-ink-2 hover:border-ink-2 hover:text-ink">
              <span className="flex items-center gap-2 font-semibold"><FolderSimplePlus className="h-5 w-5" />Dodaj teczkę</span>
              <span className="text-sm">np. kategoria bez zlecenia</span>
            </button>
          </li>
        )}
      </ul>
      {!teczki.length && !admin && <p className="flex items-center gap-2 text-sm text-ink-2"><IdentificationCard className="h-5 w-5" />Teczki pojawią się z pierwszym zleceniem na tym obiekcie.</p>}
      {adding && <AddFolder siteId={site.id} have={teczki.map((t) => t.kategoria)} onClose={() => setAdding(false)} />}
    </section>
  );
}

/** Ręczne „Dodaj teczkę” (admin, P2): kategoria bez zlecenia na obiekcie. */
export function AddFolder({ siteId, have, onClose }: { siteId: string; have: string[]; onClose: () => void }) {
  const kat = useDict('kategoria').map((k) => k.wartosc as string).filter((k) => !have.includes(k));
  const [k, setK] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!k) return;
    void createVia('passport_folders', { kind: 'paszport', url: '/api/folders', method: 'POST', body: { siteId, kategoria: k } }, { siteId, kategoria: k })
      .catch((x: Error) => toast('Nie dodano teczki', { body: x.message, tone: 'error' }));
    onClose();
    go(pszHash(siteId, k));
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Dodaj teczkę" description="Teczka kategorii, której nie ma jeszcze w zleceniach obiektu.">
        <form onSubmit={submit} className="grid gap-4">
          {kat.length ? <Field label="Kategoria">{(id) => <Select id={id} value={k || undefined} onValueChange={setK} placeholder="Wybierz kategorię" options={kat.map((v) => ({ value: v, label: v }))} />}</Field>
            : <p className="text-sm text-ink-2">Obiekt ma już teczki wszystkich kategorii.</p>}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={!k}>Dodaj teczkę</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
