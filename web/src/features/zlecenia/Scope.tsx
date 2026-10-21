import { ArrowDown, ArrowUp, Eye, ListNumbers, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useIsAdmin, useMe } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, tmpId, withoutEchoes } from '../../core/write.js';
import { fileUrl, usePicker, type Picked } from '../dziennik/Diary.js';
import { Viewer } from '../dziennik/Viewer.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
/** Tymczasowe miniatury z lokalnych plików, do czasu aż przyjdą prawdziwe z serwera. */
const tmpAtts = (ownerId: string, files: Picked[]) => {
  const now = new Date().toISOString();
  return files.map((f, i) => ({ entity: 'attachments', rec: { id: `${ownerId}-p${i}-${now}`, ownerType: 'scope', ownerId, rodzaj: 'zdjecie', nazwa: f.name, _src: f.url, createdAt: now } }));
};

/** Zakres prac: numerowane punkty z tekstem i zdjęciami. Admin dodaje, poprawia, usuwa i przesuwa; pracownik czyta. */
export function Scope({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const all = useEntities('job_scope_items');
  const atts = useEntities('attachments');
  const admin = useIsAdmin();
  const items = useMemo(() => withoutEchoes(all.filter((p) => p.jobId === jobId), ['jobId', 'tekst'])
    .sort((a, b) => a.kolejnosc - b.kolejnosc || a.createdAt.localeCompare(b.createdAt)), [all, jobId]);
  const byItem = useMemo(() => {
    const ids = new Set(items.map((p) => p.id));
    const m = new Map<string, Rec[]>();
    for (const a of atts) if (a.ownerType === 'scope' && ids.has(a.ownerId) && a.rodzaj === 'zdjecie') m.set(a.ownerId, [...(m.get(a.ownerId) ?? []), a]);
    for (const l of m.values()) l.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return m;
  }, [atts, items]);
  const photos = useMemo(() => items.flatMap((p) => byItem.get(p.id) ?? []), [items, byItem]);
  const [view, setView] = useState<number | null>(null);
  const [form, setForm] = useState<Rec | 'new' | null>(null);

  function move(i: number, d: -1 | 1) {
    const ids = items.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    void outbox.enqueue({
      kind: 'zakres', url: `/api/jobs/${jobId}/scope/order`, method: 'POST', body: { ids },
      optimistic: (s) => ids.forEach((id, k) => { const r = s.get('job_scope_items', id); if (r && r.kolejnosc !== k + 1) s.put('job_scope_items', { ...r, kolejnosc: k + 1 }); }),
    }).catch(fail('Kolejność nie została zapisana'));
  }

  const busy = items.some((p) => p._tmp);
  return (
    <section className="grid gap-3" aria-label="Zakres prac">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle count={items.length} className="flex-1">Zakres prac</SectionTitle>
        {admin && !disabled && <Button size="sm" variant="secondary" onClick={() => setForm('new')}><Plus className="h-5 w-5" weight="bold" />Dodaj punkt</Button>}
      </div>
      {!items.length && <Empty icon={ListNumbers} title="Zakres prac nie jest jeszcze opisany" hint={admin ? 'Dodaj punkty: co zrobić, z czego, gdzie. Do punktu możesz dołączyć zdjęcia.' : 'Biuro dopisze, co jest do zrobienia.'} />}
      {items.length > 0 && (
        <ol className="grid gap-2">
          {items.map((p, i) => {
            const imgs = byItem.get(p.id) ?? [];
            return (
              <li key={p.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 rounded-2xl border border-line bg-card p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-action/12 font-bold tabular-nums text-action" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <p className="max-w-[70ch] pt-1 whitespace-pre-wrap">{p.tekst}</p>
                  {p._tmp && <p className="mt-1 text-sm text-ink-2">wysyłanie…</p>}
                  {imgs.length > 0 && (
                    <ul className="mt-3 grid grid-cols-3 gap-2 min-[560px]:grid-cols-4 desk:grid-cols-6">
                      {imgs.map((a) => (
                        <li key={a.id} className="relative">
                          <button type="button" onClick={() => setView(photos.indexOf(a))} className="block w-full overflow-hidden rounded-xl bg-line/50" aria-label={`Zdjęcie do punktu ${i + 1}, powiększ`}>
                            <img src={fileUrl(a, 'thumb')} alt="" loading="lazy" decoding="async" width={160} height={160} className="aspect-square h-auto w-full object-cover" />
                          </button>
                          {admin && a.dlaKlienta && <span className="pointer-events-none absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-full bg-ok text-white" title="Widoczne dla klienta"><Eye className="h-3.5 w-3.5" weight="bold" /></span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {admin && !disabled && !p._tmp && (
                    <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setForm(p)}><PencilSimple className="h-4 w-4" />Edytuj</Button>
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" size="sm" className="w-10 px-0" aria-label={`Przesuń wyżej punkt ${i + 1}`} disabled={i === 0 || busy} onClick={() => move(i, -1)}><ArrowUp className="h-5 w-5" /></Button>
                        <Button variant="ghost" size="sm" className="w-10 px-0" aria-label={`Przesuń niżej punkt ${i + 1}`} disabled={i === items.length - 1 || busy} onClick={() => move(i, 1)}><ArrowDown className="h-5 w-5" /></Button>
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {form && <ScopeForm jobId={jobId} item={form === 'new' ? undefined : form} next={(items.at(-1)?.kolejnosc ?? 0) + 1} photos={form === 'new' ? 0 : (byItem.get(form.id)?.length ?? 0)} onClose={() => setForm(null)} />}
      {view !== null && photos[view] && <Viewer photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} admin={admin} />}
    </section>
  );
}

function ScopeForm({ jobId, item, next, photos, onClose }: { jobId: string; item?: Rec; next: number; photos: number; onClose: () => void }) {
  const me = useMe();
  const [tekst, setTekst] = useState<string>(item?.tekst ?? '');
  const { files, setFiles, busy, previews, buttons } = usePicker({ pdf: false });
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = tekst.trim();
    if (!t) return setErr('Wpisz treść punktu');
    if (t.length > 5000) return setErr('Tekst jest za długi (najwyżej 5000 znaków)');
    if (item && t === item.tekst && !files.length) return onClose();
    const sent = files;
    const blobs = sent.map((f) => f.file);
    const done = () => { for (const f of sent) URL.revokeObjectURL(f.url); };
    if (!item) {
      const id = tmpId();
      void createVia('job_scope_items', { kind: 'zakres', url: `/api/jobs/${jobId}/scope`, method: 'POST', body: { tekst: t }, files: blobs },
        { id, jobId, tekst: t, kolejnosc: next, createdBy: me?.id }, tmpAtts(id, sent)).then(done, fail('Punkt nie został zapisany'));
    } else {
      const extra = tmpAtts(item.id, sent);
      void outbox.enqueue({
        kind: 'zakres', url: `/api/scope/${item.id}`, method: 'PUT', body: t === item.tekst ? {} : { tekst: t }, files: blobs,
        optimistic: (s) => { const r = s.get('job_scope_items', item.id); if (r) s.put('job_scope_items', { ...r, tekst: t }); for (const x of extra) s.put(x.entity, { ...x.rec, _tmp: true }); },
      }).then(() => { for (const x of extra) store.remove(x.entity, x.rec.id); done(); }, fail('Zmiana punktu nie została zapisana'));
    }
    setFiles([]); // podglądy żyją dalej w miniaturach tymczasowych
    onClose();
  }

  function remove() {
    if (!confirm) return setConfirm(true);
    void outbox.enqueue({ kind: 'zakres', url: `/api/scope/${item!.id}`, method: 'DELETE', optimistic: (s) => s.remove('job_scope_items', item!.id) }).catch(fail('Nie usunięto punktu'));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={item ? 'Punkt zakresu prac' : 'Nowy punkt zakresu'} description={item && photos ? `Zdjęcia w punkcie: ${photos}. Nowe zostaną dodane.` : 'Tekst i opcjonalnie zdjęcia.'}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="zakres-tekst" className="text-sm font-semibold">Co do zrobienia</label>
            <Textarea id="zakres-tekst" value={tekst} onChange={(e) => { setTekst(e.target.value); setErr(''); }} placeholder="np. Centrala na poddaszu, kanały 160 mm do sypialni" aria-invalid={!!err} aria-describedby={err ? 'zakres-tekst-e' : undefined} autoFocus />
            {err && <p id="zakres-tekst-e" role="alert" className="text-sm text-danger">{err}</p>}
          </div>
          {previews}
          <div className="flex flex-wrap gap-2">{buttons}</div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {item && (
              <Button variant={confirm ? 'danger' : 'ghost'} size="sm" onClick={remove} className={confirm ? undefined : 'text-danger'}>
                <Trash className="h-4 w-4" />{confirm ? 'Na pewno usunąć punkt i zdjęcia?' : 'Usuń punkt'}
              </Button>
            )}
            <Button type="submit" className="ml-auto" disabled={busy}>Zapisz</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
