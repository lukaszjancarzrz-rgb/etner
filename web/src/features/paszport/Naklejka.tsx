import { ArrowsClockwise, Copy, DownloadSimple, GridFour, Printer, ShareNetwork } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../core/api.js';
import { useIsAdmin } from '../../core/data.js';
import { useOnline } from '../../core/layout/status.js';
import { store, type Rec } from '../../core/store.js';
import { Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { drawLabel, LABEL_SIZES, labelBlob, printLabel, type Firma, type LabelSize } from './naklejka.js';

const FIRMA_KEY = 'etner-firma', SIZE_KEY = 'etner-naklejka';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* bez pamięci przeglądarki */ } } };

/** Dane firmy z serwera; ostatnie zapamiętane w telefonie (naklejka offline). */
function useFirma(): Firma {
  const [f, setF] = useState<Firma>(() => { try { return JSON.parse(ls.get(FIRMA_KEY) ?? '') as Firma; } catch { return { nazwa: 'ETNER', telefon: '', www: '' }; } });
  useEffect(() => { api<Firma>('/api/settings/firma').then((r) => { setF(r); ls.set(FIRMA_KEY, JSON.stringify(r)); }, () => {}); }, []);
  return f;
}

/** Logo z aplikacji bez wariantu ciemnego (na naklejce zawsze białe tło). */
function useLogo(): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    void fetch('/icon.svg').then((r) => r.text()).then((t) => {
      const i = new Image();
      i.onload = () => setImg(i);
      i.src = `data:image/svg+xml,${encodeURIComponent(t.replace(/@media[^{]*\{[^}]*\}\}/, ''))}`;
    }).catch(() => {});
  }, []);
  return img;
}

const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([''], 'n.png', { type: 'image/png' })] }); } catch { return false; } };

/** Kod QR i naklejka (P8): podgląd, rozmiar, udostępnij / pobierz / drukuj / arkusz A4, link; nowy link – admin. Biblioteka QR tylko w tym pakiecie. */
export default function Naklejka({ passport, klient }: { passport: Rec; klient: string }) {
  const admin = useIsAdmin();
  const firma = useFirma();
  const logo = useLogo();
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<LabelSize>(() => { const v = ls.get(SIZE_KEY); return v && v in LABEL_SIZES ? v as LabelSize : '50x30'; });
  const [renew, setRenew] = useState(false);
  const token = passport.token as string | null;
  const url = token ? `${location.origin}/p/${token}` : ''; // zawsze cały paszport (właściciel: bez linków do teczek)
  const name = `naklejka-${passport.numer}.png`.replace(/[^\w.-]+/g, '_');

  useEffect(() => {
    if (ref.current && url) drawLabel(ref.current, size, { url, numer: passport.numer, klient, firma }, logo);
  }, [url, size, passport.numer, klient, firma, logo]);

  const pick = (s: LabelSize) => { setSize(s); ls.set(SIZE_KEY, s); };
  const file = async () => new File([await labelBlob(ref.current!)], name, { type: 'image/png' });
  const fail = (what: string) => (e: unknown) => { if ((e as Error).name !== 'AbortError') toast(what, { body: (e as Error).message, tone: 'error' }); };
  async function download() {
    const u = URL.createObjectURL(await file());
    const a = Object.assign(document.createElement('a'), { href: u, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }

  if (!url) return <p className="text-sm text-ink-2">Paszport nie ma aktywnego linku.{admin ? ' Utwórz nowy link poniżej.' : ' Poproś admina o nowy link.'}</p>;
  const [w, h] = LABEL_SIZES[size];
  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center rounded-2xl border-2 border-dashed border-line bg-white p-3">
        <canvas ref={ref} role="img" aria-label={`Podgląd naklejki ${passport.numer}`} className="h-auto w-full max-w-[200px]" style={{ aspectRatio: `${w} / ${h}` }} />
      </div>
      <Segmented label="Rozmiar naklejki" value={size} onChange={pick} options={(Object.keys(LABEL_SIZES) as LabelSize[]).map((v) => ({ v, label: `${v.replace('x', '×')} mm` }))} />
      <div className="grid gap-2 min-[560px]:grid-cols-2">
        {canShareFiles() && <Button onClick={() => void file().then((f) => navigator.share({ files: [f], title: name })).catch(fail('Nie udostępniono obrazu'))}><ShareNetwork className="h-5 w-5" />Udostępnij obraz</Button>}
        <Button variant="secondary" onClick={() => void download().catch(fail('Nie pobrano obrazu'))}><DownloadSimple className="h-5 w-5" />Pobierz obraz</Button>
        <Button variant="secondary" onClick={() => void printLabel(ref.current!.toDataURL('image/png'), size, false)}><Printer className="h-5 w-5" />Drukuj</Button>
        <Button variant="secondary" onClick={() => void printLabel(ref.current!.toDataURL('image/png'), size, true)}><GridFour className="h-5 w-5" />Arkusz A4</Button>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={url}>{url}</span>
        <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(url).then(() => toast('Skopiowano link', { tone: 'ok' }), fail('Nie skopiowano linku'))}><Copy className="h-4 w-4" />Kopiuj link</Button>
      </div>
      {admin && <Button variant="ghost" size="sm" className="justify-self-start text-danger" onClick={() => setRenew(true)}><ArrowsClockwise className="h-4 w-4" />Unieważnij link i utwórz nowy</Button>}
      {renew && <Renew passport={passport} onClose={() => setRenew(false)} />}
    </div>
  );
}

/** Nowy link (admin, tylko z siecią – nie przez kolejkę): stara naklejka przestaje działać. */
function Renew({ passport, onClose }: { passport: Rec; onClose: () => void }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`/api/passports/${passport.id}/link`, { method: 'POST' });
      store.put('passports', { ...passport, token: url.split('/p/')[1] }); // ta sama zmiana przyjdzie też synchronizacją
      toast('Nowy link gotowy', { body: 'Wydrukuj nową naklejkę. Stara już nie działa.', tone: 'ok' });
      onClose();
    } catch (e) {
      toast('Nie utworzono nowego linku', { body: e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.', tone: 'error' });
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Unieważnić link?" description={`Paszport ${passport.numer}: stara naklejka i stary link przestaną działać. Trzeba będzie nakleić nową.`}>
        {!online && <p className="mb-4 text-sm text-danger">Bez połączenia. Nowy link utworzysz, gdy wróci zasięg.</p>}
        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>Anuluj</Button>
          <Button variant="danger" disabled={!online || busy} onClick={() => void go()}>Unieważnij i utwórz nowy</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
