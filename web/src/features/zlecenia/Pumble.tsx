import { ArrowSquareOut, Camera, ChatsCircle, PaperclipHorizontal, PaperPlaneRight, Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '@etner/shared';
import { api, ApiError } from '../../core/api.js';
import { fmtWhen, useIsAdmin } from '../../core/data.js';
import { useOnline } from '../../core/layout/status.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { toast } from '../../core/ui/toast.js';

const HOME = 'https://app.pumble.com';
// raz na uruchomienie aplikacji; brak sieci = sekcja ukryta do następnego otwarcia karty
let status: Promise<boolean> | undefined;
const pumbleOn = () => (status ??= api<{ enabled: boolean }>('/api/pumble/status').then((r) => r.enabled, () => { status = undefined; return false; }));

/** Ostatnie wiadomości kanału Pumble zlecenia (od najstarszej). */
export const jobMessages = (all: Rec[], jobId: string): Rec[] =>
  all.filter((m) => m.jobId === jobId).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));

const IMG = /\.(jpe?g|png|gif|webp|heic|avif|bmp)$/i;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** Liczba zdjęć i innych plików wiadomości (kolumna `files`: {files, attachments?}). Podglądów nie ma: files.pumble.com odrzuca klucz API (401). */
export function fileInfo(m: Rec): { images: number; others: number } {
  let list: Rec[] = [];
  try { const j = JSON.parse(m.files ?? 'null'); list = Array.isArray(j) ? j : [...(j?.files ?? []), ...(j?.attachments ?? [])]; } catch { /* uszkodzone dane = brak plików */ }
  const images = list.filter((f) => str(f.mimeType ?? f.mimetype ?? f.contentType).startsWith('image/') || IMG.test(str(f.name) || str(f.fileName) || str(f.title))).length;
  return { images, others: list.length - images };
}
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 20) ? few : many);
export const fileLine = (author: string, { images, others }: { images: number; others: number }): { img: boolean; text: string }[] => [
  ...(images ? [{ img: true, text: `${author} wrzucił ${images === 1 ? 'zdjęcie' : `${images} ${plural(images, '', 'zdjęcia', 'zdjęć')}`}` }] : []),
  ...(others ? [{ img: false, text: `${author} wrzucił ${others === 1 ? 'plik' : others > 1 ? `${others} ${plural(others, '', 'pliki', 'plików')}` : ''}` }] : []),
];

/** Sekcja „Pumble” karty zlecenia: kilka ostatnich wiadomości, pole do kanału, przejście do Pumble. Wymaga sieci (nie idzie przez kolejkę offline). */
export function Pumble({ job }: { job: Rec }) {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; void pumbleOn().then((v) => live && setOn(v)); return () => { live = false; }; }, []);
  const all = useEntities('pumble_messages');
  const msgs = useMemo(() => jobMessages(all, job.id), [all, job.id]);
  const [more, setMore] = useState(false);
  const admin = useIsAdmin();
  const online = useOnline();
  const [url, setUrl] = useState(HOME);
  const ch = job.pumbleChannelId as string | null | undefined;
  useEffect(() => {
    if (!on || !ch) return;
    let live = true;
    void api<{ url: string }>(`/api/pumble/link/${job.id}`).then((r) => live && setUrl(r.url), () => {});
    return () => { live = false; };
  }, [on, ch, job.id]);
  // sygnał „oglądam”: serwer odpytuje ten kanał co 3 s zamiast co 30 s
  useEffect(() => {
    if (!on || !ch || job._tmp) return;
    const ping = () => { if (document.visibilityState === 'visible') void api(`/api/jobs/${job.id}/pumble/watch`, { method: 'POST' }).catch(() => {}); };
    ping();
    const t = setInterval(ping, 15_000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, [on, ch, job.id, job._tmp]);
  const [creating, setCreating] = useState(false);

  if (!on || job._tmp) return null;
  const shown = more ? msgs : msgs.slice(-5);

  async function create() {
    setCreating(true);
    try { store.put('jobs', await api<Rec>(`/api/jobs/${job.id}/pumble/channel`, { method: 'POST' })); }
    catch (e) { toast('Nie udało się utworzyć kanału w Pumble.', { body: e instanceof ApiError && e.body && (e.body as Rec).error === 'PUMBLE' ? 'Pumble nie odpowiada. Spróbuj za chwilę.' : (e as Error).message, tone: 'error' }); }
    finally { setCreating(false); }
  }

  return (
    <section className="grid gap-3" aria-label="Pumble">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle count={msgs.length || undefined} className="flex-1">Pumble</SectionTitle>
        {ch && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold hover:border-ink-2"><ArrowSquareOut className="h-5 w-5" />Przejdź do Pumble</a>}
      </div>
      {!ch ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4">
          <p className="flex items-center gap-2 text-ink-2"><ChatsCircle className="h-6 w-6" weight="duotone" />Kanał jeszcze nie utworzony</p>
          {admin && <Button size="sm" variant="secondary" disabled={creating || !online} onClick={() => void create()}><Plus className="h-5 w-5" weight="bold" />Utwórz kanał w Pumble</Button>}
        </div>
      ) : (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-4">
          {msgs.length > 5 && !more && <button type="button" onClick={() => setMore(true)} className="h-10 justify-self-start font-semibold text-action">Pokaż więcej ({msgs.length - 5})</button>}
          {shown.length ? (
            <ol className="grid gap-3" aria-live="polite">
              {shown.map((m) => (
                <li key={m.id} className="grid gap-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold">{m.authorName}</span><span className="text-sm text-ink-2">{fmtWhen(m.sentAt)}</span></p>
                  {m.text && <p className="max-w-[70ch] whitespace-pre-wrap break-words">{m.text}</p>}
                  <Files m={m} />
                </li>
              ))}
            </ol>
          ) : <p className="text-ink-2">Brak wiadomości w kanale.</p>}
          <SendForm jobId={job.id} online={online} />
        </div>
      )}
    </section>
  );
}

function Files({ m }: { m: Rec }) {
  if (!m.files) return null;
  return <>{fileLine(m.authorName, fileInfo(m)).map((l) => (
    <p key={l.text} className="flex items-center gap-2 text-sm text-ink-2">{l.img ? <Camera className="h-5 w-5" /> : <PaperclipHorizontal className="h-5 w-5" />}{l.text}</p>
  ))}</>;
}

function SendForm({ jobId, online }: { jobId: string; online: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // jeden opId na treść: ponowienie po przekroczeniu czasu nie wyśle drugi raz; zmiana treści = nowa wiadomość
  const op = useRef(newId());
  const id = `pb-${jobId}`;

  async function send() {
    const t = text.trim();
    if (!t || busy || !online) return;
    if (t.length > 4000) return setErr('Wiadomość jest za długa (najwyżej 4000 znaków).');
    setBusy(true);
    setErr('');
    try {
      store.put('pumble_messages', await api<Rec>(`/api/jobs/${jobId}/pumble`, { method: 'POST', json: { text: t, opId: op.current } }));
      setText('');
      op.current = newId();
    } catch (e) {
      setErr(e instanceof ApiError && (e.body as Rec | undefined)?.error !== 'PUMBLE' ? e.message : 'Nie udało się wysłać do Pumble.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="grid gap-2 border-t border-line pt-3" noValidate>
      <label htmlFor={id} className="sr-only">Wiadomość do kanału Pumble</label>
      <div className="flex items-end gap-2">
        <Textarea id={id} value={text} rows={1} onChange={(e) => { setText(e.target.value); op.current = newId(); }} placeholder="Napisz do kanału…" className="min-h-12! flex-1 resize-y py-2.5"
          aria-invalid={!!err} aria-describedby={err ? `${id}-e` : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <Button type="submit" size="icon" aria-label="Wyślij do Pumble" disabled={busy || !online || !text.trim()}><PaperPlaneRight className="h-5 w-5" weight="fill" /></Button>
      </div>
      {!online && <p className="text-sm text-ink-2">Bez połączenia. Wiadomość do Pumble wyślesz, gdy wróci zasięg.</p>}
      {err && <p id={`${id}-e`} role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
