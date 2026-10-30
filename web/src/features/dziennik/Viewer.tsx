import * as D from '@radix-ui/react-dialog';
import { ArrowsIn, ArrowsOut, CaretLeft, CaretRight, MagnifyingGlassPlus, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { Rec } from '../../core/store.js';
import { cn } from '../../core/ui/cn.js';
import { toast } from '../../core/ui/toast.js';
import { updateVia } from '../../core/write.js';
import { KlientToggle, fileUrl } from './Diary.js';

/**
 * „Wstecz” (Android, przeglądarka) zamyka warstwę zamiast wychodzić z aplikacji: warstwa dokłada wpis historii
 * z tym samym adresem (bez hashchange, router stoi), a `layer` w stanie mówi, która warstwa jest na wierzchu.
 */
export function useBackClose(onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const depth = ((history.state as { layer?: number } | null)?.layer ?? 0) + 1;
    history.pushState({ ...(history.state as object | null), layer: depth }, '');
    const pop = () => { if (((history.state as { layer?: number } | null)?.layer ?? 0) < depth) close.current(); };
    addEventListener('popstate', pop);
    return () => {
      removeEventListener('popstate', pop);
      if ((history.state as { layer?: number } | null)?.layer === depth) history.back(); // zamknięte przyciskiem: zdejmij swój wpis
    };
  }, []);
}

/** Podgląd pełnoekranowy: strzałki, klawiatura, przesunięcie palcem; admin przełącza „Pokaż klientowi”. */
export function Viewer({ photos, index, onIndex, onClose, admin }: { photos: Rec[]; index: number; onIndex: (i: number) => void; onClose: () => void; admin: boolean }) {
  const a = photos[index]!;
  const n = photos.length;
  const prev = () => onIndex((index - 1 + n) % n);
  const next = () => onIndex((index + 1) % n);
  const x0 = useRef<number | null>(null);
  const [orig, setOrig] = useState(false);
  useBackClose(onClose);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (orig) return; if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const toggle = (v: boolean) => void updateVia('attachments', a.id, { dlaKlienta: v }, { kind: 'dziennik', url: `/api/attachments/${a.id}`, method: 'PATCH', body: { dla_klienta: v } })
    .catch((e: Error) => toast('Nie zapisano', { body: e.message, tone: 'error' }));

  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#050f1d]/95" />
        <D.Content className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-[#050f1d] text-white outline-none" aria-describedby={undefined}
          onEscapeKeyDown={(e) => { if (orig) { e.preventDefault(); setOrig(false); } }}
          onPointerDown={(e) => { x0.current = e.clientX; }}
          onPointerUp={(e) => { if (!orig && x0.current !== null && Math.abs(e.clientX - x0.current) > 50 && n > 1) (e.clientX < x0.current ? next : prev)(); x0.current = null; }}>
          <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            <D.Title className="text-sm font-semibold tabular-nums">Zdjęcie {index + 1} z {n}</D.Title>
            <D.Close className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Zamknij"><X className="h-6 w-6" weight="bold" /></D.Close>
          </div>
          <div className="relative grid min-h-0 place-items-center overflow-hidden px-2">
            <img key={a.id} src={fileUrl(a, 'view')} alt={a.nazwa ?? ''} width={a.w ?? undefined} height={a.h ?? undefined}
              className="absolute inset-0 h-full w-full select-none object-contain p-2" draggable={false} />
            {n > 1 && (
              <>
                <button type="button" onClick={prev} aria-label="Poprzednie zdjęcie" className="absolute top-1/2 left-2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60"><CaretLeft className="h-6 w-6" weight="bold" /></button>
                <button type="button" onClick={next} aria-label="Następne zdjęcie" className="absolute top-1/2 right-2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60"><CaretRight className="h-6 w-6" weight="bold" /></button>
              </>
            )}
          </div>
          <div className="flex min-h-14 items-center justify-center gap-3 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {admin && !a._tmp && <KlientToggle on={!!a.dlaKlienta} onChange={toggle} dark />}
            <button type="button" onClick={() => setOrig(true)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-white/85 hover:bg-white/10"><MagnifyingGlassPlus className="h-5 w-5" aria-hidden />Oryginał</button>
          </div>
          {orig && <Original a={a} onClose={() => setOrig(false)} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Oryginał w pełnej rozdzielczości w aplikacji (na telefonie otwarcie adresu pliku wyprowadzało z PWA). Dotknięcie: dopasuj ↔ 100 %. */
function Original({ a, onClose }: { a: Rec; onClose: () => void }) {
  const [fit, setFit] = useState(false);
  useBackClose(onClose);
  return (
    <div className="absolute inset-0 z-10 grid grid-rows-[auto_1fr] bg-[#050f1d]" role="group" aria-label="Oryginał zdjęcia" data-original>
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p className="min-w-0 truncate text-sm font-semibold">Oryginał{a.w && a.h ? <span className="font-normal text-white/70 tabular-nums">, {a.w}×{a.h}</span> : null}</p>
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setFit(!fit)} aria-pressed={fit} aria-label={fit ? 'Pełna rozdzielczość' : 'Dopasuj do ekranu'} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            {fit ? <ArrowsOut className="h-6 w-6" weight="bold" /> : <ArrowsIn className="h-6 w-6" weight="bold" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Zamknij oryginał" className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-6 w-6" weight="bold" /></button>
        </span>
      </div>
      <div className={cn('min-h-0 overscroll-contain', fit ? 'grid place-items-center overflow-hidden' : 'overflow-auto')} style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
        {/* w-max + min-w-full: duże zdjęcie przewija się od lewego brzegu, małe stoi na środku */}
        <div className={fit ? 'contents' : 'grid min-h-full w-max min-w-full place-items-center'}>
          <img src={fileUrl(a, 'orig')} alt={a.nazwa ?? ''} width={a.w ?? undefined} height={a.h ?? undefined} onClick={() => setFit(!fit)} draggable={false}
            className={cn('select-none', fit ? 'h-full w-full object-contain p-2' : 'block h-auto max-w-none')} />
        </div>
      </div>
    </div>
  );
}
