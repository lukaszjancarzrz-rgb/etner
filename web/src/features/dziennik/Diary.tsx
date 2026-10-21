import { Camera, Eye, EyeSlash, FilePdf, ImageSquare, NotePencil, PaperPlaneRight, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtWhen, useIsAdmin, useMe, useNames } from '../../core/data.js';
import { resizePhoto } from '../../core/photo.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, tmpId, updateVia, withoutEchoes } from '../../core/write.js';
import { Viewer } from './Viewer.js';

export const fileUrl = (a: Rec, v: 'thumb' | 'view' | 'orig') => a._src ?? `/api/attachments/${a.id}/file?v=${v}`;

/** Dziennik zlecenia (lub leada): formularz wpisu, wpisy od najnowszego, miniatury i podgląd. */
export function Diary({ ownerType, ownerId, highlight, disabled }: { ownerType: 'job' | 'lead'; ownerId: string; highlight?: string; disabled?: boolean }) {
  const all = useEntities('diary_entries');
  const atts = useEntities('attachments');
  const admin = useIsAdmin();
  const names = useNames();
  const entries = useMemo(() => withoutEchoes(all.filter((e) => e.ownerType === ownerType && e.ownerId === ownerId), ['authorId', 'tekst']).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [all, ownerType, ownerId]);
  const byEntry = useMemo(() => {
    const ids = new Set(entries.map((e) => e.id));
    const m = new Map<string, Rec[]>();
    for (const a of atts) if (a.ownerType === 'entry' && ids.has(a.ownerId)) m.set(a.ownerId, [...(m.get(a.ownerId) ?? []), a]);
    for (const l of m.values()) l.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return m;
  }, [atts, entries]);
  const photos = useMemo(() => entries.flatMap((e) => (byEntry.get(e.id) ?? []).filter((a) => a.rodzaj === 'zdjecie')), [entries, byEntry]);
  const [view, setView] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | undefined>();

  // ~wpis z powiadomienia: przewiń i podświetl
  const found = highlight && entries.some((e) => e.id === highlight);
  useEffect(() => {
    if (!found) return;
    document.getElementById(`e-${highlight}`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setFlash(highlight);
    const t = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(t);
  }, [found, highlight]);

  return (
    <section className="grid gap-3" aria-label="Dziennik">
      <SectionTitle count={entries.length}>Dziennik</SectionTitle>
      {!disabled && <EntryForm ownerType={ownerType} ownerId={ownerId} />}
      {!entries.length && <Empty icon={NotePencil} title="Brak wpisów" hint="Zapisz, co zrobiono na miejscu, i dodaj zdjęcia. Biuro dostanie powiadomienie." />}
      <ol className="grid gap-3">
        {entries.map((e) => {
          const files = byEntry.get(e.id) ?? [];
          const imgs = files.filter((a) => a.rodzaj === 'zdjecie');
          const docs = files.filter((a) => a.rodzaj !== 'zdjecie');
          return (
            <li key={e.id} id={`e-${e.id}`} className={cn('scroll-mt-24 rounded-2xl border bg-card p-4 transition-[box-shadow,border-color] duration-300', flash === e.id ? 'border-ok ring-4 ring-ok/25' : 'border-line')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold">{e.authorId ? names(e.authorId) : 'Wpis systemowy'}</p>
                <p className="text-sm text-ink-2">{e._tmp ? 'wysyłanie…' : fmtWhen(e.createdAt)}</p>
              </div>
              {e.tekst && <p className={cn('mt-1.5 max-w-[70ch] whitespace-pre-wrap', !e.authorId && 'text-ink-2')}>{e.tekst}</p>}
              {imgs.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2 min-[560px]:grid-cols-4 desk:grid-cols-5">
                  {imgs.map((a) => (
                    <li key={a.id} className="relative">
                      <button type="button" onClick={() => setView(photos.indexOf(a))} className="block w-full overflow-hidden rounded-xl bg-line/50" aria-label={`Zdjęcie ${a.nazwa ?? ''}, powiększ`}>
                        <img src={fileUrl(a, 'thumb')} alt="" loading="lazy" decoding="async" width={160} height={160} className="aspect-square h-auto w-full object-cover" />
                      </button>
                      {admin && a.dlaKlienta && <span className="pointer-events-none absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-full bg-ok text-white" title="Widoczne dla klienta"><Eye className="h-3.5 w-3.5" weight="bold" /></span>}
                    </li>
                  ))}
                </ul>
              )}
              {docs.map((a) => (
                <a key={a.id} href={fileUrl(a, 'orig')} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"><FilePdf className="h-5 w-5" />{a.nazwa}</a>
              ))}
              {admin && !e._tmp && e.authorId && (
                <div className="mt-3 border-t border-line pt-2">
                  <KlientToggle on={!!e.dlaKlienta} onChange={(v) => void updateVia('diary_entries', e.id, { dlaKlienta: v }, { kind: 'dziennik', url: `/api/diary/${e.id}`, method: 'PATCH', body: { dla_klienta: v } }).catch((x: Error) => toast('Nie zapisano', { body: x.message, tone: 'error' }))} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {view !== null && photos[view] && <Viewer photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} admin={admin} />}
    </section>
  );
}

export function KlientToggle({ on, onChange, dark }: { on: boolean; onChange: (v: boolean) => void; dark?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors duration-200', on ? (dark ? 'bg-ok text-white' : 'bg-ok/12 text-ok') : dark ? 'text-white/85 hover:bg-white/10' : 'text-ink-2 hover:bg-ink/5')}>
      {on ? <Eye className="h-5 w-5" weight="bold" aria-hidden /> : <EyeSlash className="h-5 w-5" aria-hidden />}
      Pokaż klientowi
    </button>
  );
}

type Picked = { file: Blob; name: string; url: string; img: boolean };

function EntryForm({ ownerType, ownerId }: { ownerType: 'job' | 'lead'; ownerId: string }) {
  const [tekst, setTekst] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const me = useMe();
  const current = useRef<Picked[]>([]);
  current.current = files;
  // podglądy niewysłanych plików zwalniamy przy wyjściu z karty
  useEffect(() => () => { alive.current = false; for (const f of current.current) URL.revokeObjectURL(f.url); }, []);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const out: Picked[] = [];
      for (const f of [...list]) {
        const b = await resizePhoto(f);
        out.push({ file: b, name: f.name, url: URL.createObjectURL(b), img: b.type.startsWith('image/') });
      }
      setFiles((x) => [...x, ...out].slice(0, 30));
      setErr('');
    } finally { setBusy(false); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = tekst.trim();
    if (!t && !files.length) return setErr('Wpisz tekst albo dodaj zdjęcie.');
    if (t.length > 5000) return setErr('Wpis jest za długi (najwyżej 5000 znaków).');
    const entryTmp = tmpId();
    const sent = files;
    const now = new Date().toISOString();
    // Podgląd od razu z lokalnych plików; prawdziwe miniatury przychodzą z serwera.
    const extra = sent.map((f, i) => ({ entity: 'attachments', rec: { id: `${entryTmp}-${i}`, ownerType: 'entry', ownerId: entryTmp, rodzaj: f.img ? 'zdjecie' : 'plik', nazwa: f.name, _src: f.url, createdAt: now } }));
    void createVia('diary_entries', { kind: 'dziennik', url: '/api/diary', method: 'POST', body: { owner_type: ownerType, owner_id: ownerId, tekst: t }, files: sent.map((f) => f.file) },
      { id: entryTmp, ownerType, ownerId, tekst: t, authorId: me?.id }, extra).then(() => { for (const f of sent) URL.revokeObjectURL(f.url); }, (x: Error) => {
      // odrzucony wpis wraca do formularza z tekstem i zdjęciami
      if (alive.current) { setTekst((cur) => cur || t); setFiles((cur) => (cur.length ? cur : sent)); setErr(x.message); }
      else toast('Wpis nie został zapisany', { body: x.message, tone: 'error' });
    });
    setTekst('');
    setFiles([]);
    setErr('');
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-card p-4" noValidate>
      <label htmlFor={`dz-${ownerId}`} className="sr-only">Nowy wpis</label>
      <Textarea id={`dz-${ownerId}`} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Co zrobiono, czego brakuje, uwagi z budowy" aria-invalid={!!err} aria-describedby={err ? `dz-${ownerId}-e` : undefined} className="min-h-20" />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Wybrane pliki">
          {files.map((f, i) => (
            <li key={f.url} className="relative">
              {f.img ? <img src={f.url} alt={f.name} width={72} height={72} className="h-18 w-18 rounded-xl object-cover" />
                : <span className="grid h-18 w-18 place-items-center rounded-xl border border-line text-xs"><FilePdf className="h-6 w-6" /></span>}
              <button type="button" aria-label={`Usuń ${f.name}`} onClick={() => { URL.revokeObjectURL(f.url); setFiles((x) => x.filter((_, k) => k !== i)); }}
                className="absolute -top-2 -right-2 grid h-8 w-8 place-items-center rounded-full border border-line bg-card shadow-card"><X className="h-4 w-4" weight="bold" /></button>
            </li>
          ))}
        </ul>
      )}
      {err && <p id={`dz-${ownerId}-e`} role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden data-camera onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <input ref={gal} type="file" accept="image/*,application/pdf" multiple className="sr-only" tabIndex={-1} aria-hidden data-gallery onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <Button variant="secondary" size="sm" onClick={() => cam.current?.click()}><Camera className="h-5 w-5" />Aparat</Button>
        <Button variant="secondary" size="sm" onClick={() => gal.current?.click()}><ImageSquare className="h-5 w-5" />Galeria</Button>
        <Button type="submit" size="sm" className="ml-auto" disabled={busy}><PaperPlaneRight className="h-5 w-5" weight="fill" />Dodaj wpis</Button>
      </div>
    </form>
  );
}
