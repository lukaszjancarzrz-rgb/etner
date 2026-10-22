import { ArrowDown, ArrowUp, Bell, BookOpen, Bug, Clock, Copy, Desktop, Database, Key, Moon, Plus, Sun, Trash } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DICT_GRUPY, DICT_RODZAJE } from '@etner/shared';
import { disablePush, enablePush, pushState, testPush, type PushState } from '../../core/push.js';
import { ApiError, api } from '../../core/api.js';
import { fmtWhen, useIsAdmin } from '../../core/data.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { setTheme, useTheme, type Theme } from '../../core/theme.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { move } from '../uzytkownicy/model.js';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');

const Card = ({ title, icon: I, hint, children, className }: { title: string; icon: typeof Sun; hint?: string; children: ReactNode; className?: string }) => (
  <section aria-label={title} className={cn('grid content-start gap-4 rounded-2xl border border-line bg-card p-5', className)}>
    <div>
      <h2 className="flex items-center gap-2 font-wide text-lg font-extrabold"><I className="h-5 w-5 text-action" weight="duotone" />{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Ustawienia: motyw, powiadomienia, hasło; admin dodatkowo słowniki, godzina przypomnienia, log błędów, stan kopii. */
export function Ustawienia() {
  const admin = useIsAdmin();
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-4 desk:grid-cols-2 desk:items-start desk:py-6">
      <div className="grid gap-5">
        <ThemeCard />
        <Notifications />
        <ChangePassword />
        {admin && <Morning />}
        {admin && <Backups />}
      </div>
      {admin && (
        <div className="grid gap-5">
          <Dictionaries />
          <ErrorLog />
        </div>
      )}
    </div>
  );
}

const themes: { v: Theme; label: string; icon: typeof Sun }[] = [
  { v: 'system', label: 'Auto', icon: Desktop },
  { v: 'light', label: 'Jasny', icon: Sun },
  { v: 'dark', label: 'Ciemny', icon: Moon },
];

function ThemeCard() {
  const theme = useTheme();
  return (
    <Card title="Motyw" icon={Sun} hint="Wygląd aplikacji na tym urządzeniu. Auto = jak w telefonie.">
      <div role="radiogroup" aria-label="Motyw" className="grid grid-cols-3 gap-1 rounded-full border border-line p-1">
        {themes.map(({ v, label, icon: I }) => (
          <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}
            className={cn('flex h-11 items-center justify-center gap-2 rounded-full px-2 text-sm font-semibold transition-colors duration-200',
              theme === v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>
            <I className="h-5 w-5 shrink-0" /><span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ChangePassword() {
  const [stare, setStare] = useState('');
  const [nowe, setNowe] = useState('');
  const [powt, setPowt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nowe.length < 8) return setError('Nowe hasło musi mieć co najmniej 8 znaków.');
    if (nowe !== powt) return setError('Powtórzone hasło jest inne niż nowe.');
    setBusy(true);
    try {
      await api('/api/me/haslo', { method: 'POST', json: { stare, nowe } });
      setStare(''); setNowe(''); setPowt(''); setError(null);
      toast('Hasło zostało zmienione', { body: 'Na pozostałych urządzeniach zalogujesz się ponownie.', tone: 'ok' });
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setError(code === 'ZLE_HASLO' ? 'Obecne hasło jest nieprawidłowe.' : msg(err));
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 font-wide text-lg font-extrabold"><Key className="h-5 w-5 text-action" weight="duotone" />Zmień hasło</h2>
      <Field label="Obecne hasło">{(id) => <Input id={id} type="password" autoComplete="current-password" value={stare} onChange={(e) => setStare(e.target.value)} required />}</Field>
      <Field label="Nowe hasło" hint="Co najmniej 8 znaków.">{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" minLength={8} value={nowe} onChange={(e) => setNowe(e.target.value)} required />}</Field>
      <Field label="Powtórz nowe hasło">{(id) => <Input id={id} type="password" autoComplete="new-password" value={powt} onChange={(e) => setPowt(e.target.value)} required />}</Field>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <Button type="submit" variant="secondary" disabled={busy}>Zmień hasło</Button>
    </form>
  );
}

const STAN: Partial<Record<PushState, string>> = {
  wlaczone: 'Włączone na tym urządzeniu.',
  wylaczone: 'Wyłączone na tym urządzeniu.',
  zablokowane: 'Zablokowane w ustawieniach przeglądarki. Zezwól na powiadomienia dla tej strony w ustawieniach telefonu lub przeglądarki.',
};

function Notifications() {
  const [st, setSt] = useState<PushState | 'blad' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt, () => setSt('blad')); }, []);
  const run = async (f: () => Promise<PushState | void>, ok?: string) => {
    setBusy(true);
    try { const r = await f(); if (r) setSt(r); if (ok) toast(ok, { tone: 'ok' }); }
    catch (err) { toast('Nie udało się', { body: msg(err), tone: 'error' }); }
    setBusy(false);
  };
  const sendTest = () => run(async () => {
    const { sent } = await testPush();
    if (!sent) throw new ApiError(0, 'Serwer nie wysłał powiadomienia. Wyłącz i włącz powiadomienia ponownie.');
  }, 'Wysłano próbne powiadomienie');
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-card p-5" aria-busy={st === null}>
      <h2 className="flex items-center gap-2 font-wide text-lg font-extrabold"><Bell className="h-5 w-5 text-action" weight="duotone" />Powiadomienia</h2>
      {st === null ? <p className="text-sm text-ink-2">Sprawdzanie…</p>
        : st === 'ios' ? <p className="text-sm">Na iPhonie: Udostępnij → Do ekranu początkowego, potem otwórz aplikację z ikony.</p>
        : st === 'brak' ? <p className="text-sm text-ink-2">Ta przeglądarka nie obsługuje powiadomień. Otwórz aplikację w Chrome lub Safari na telefonie.</p>
        : st === 'blad' ? <p className="text-sm text-ink-2">Nie udało się sprawdzić powiadomień. Sprawdź połączenie i otwórz ten ekran ponownie.</p>
        : st === 'serwer' ? <p className="text-sm text-ink-2">Serwer nie ma włączonych powiadomień.</p>
        : (
          <>
            <p className={cn('text-sm', st === 'wlaczone' ? 'font-semibold text-ok' : st === 'zablokowane' ? 'text-danger' : 'text-ink-2')} role="status">{STAN[st]}</p>
            {st === 'wylaczone' && <Button onClick={() => void run(enablePush)} disabled={busy}><Bell className="h-5 w-5 shrink-0" /><span className="whitespace-normal leading-tight">Włącz powiadomienia na tym urządzeniu</span></Button>}
            {st === 'wlaczone' && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void sendTest()} disabled={busy}>Wyślij próbne powiadomienie</Button>
                <Button variant="secondary" onClick={() => void run(disablePush)} disabled={busy}>Wyłącz</Button>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function Morning() {
  const [v, setV] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ godzina: string }>('/api/settings/rano').then((r) => { setV(r.godzina); setSaved(r.godzina); }, (e) => setErr(msg(e))); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return setErr('Godzina w formacie GG:MM, np. 07:00');
    try { await api('/api/settings/rano', { method: 'PUT', json: { godzina: v } }); setSaved(v); setErr(''); toast('Zapisano godzinę przypomnienia', { tone: 'ok' }); }
    catch (x) { setErr(msg(x)); }
  }
  return (
    <Card title="Poranne przypomnienie" icon={Clock} hint="O tej godzinie (czas polski) aplikacja wysyła poranne powiadomienia, np. o zaległych kontaktach z leadami.">
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <Field label="Godzina" error={err}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} type="time" step={60} value={v ?? ''} disabled={v === null} onChange={(e) => setV(e.target.value)} />}</Field>
        <Button type="submit" variant="secondary" disabled={!v || v === saved} className={cn(err && 'mb-7')}>Zapisz</Button>
      </form>
    </Card>
  );
}

const DAY_MS = 86_400_000;
function Backups() {
  const [k, setK] = useState<{ eksport: string | null; zdjecia: string | null } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ eksport: string | null; zdjecia: string | null }>('/api/settings/kopie').then(setK, (e) => setErr(msg(e))); }, []);
  const row = (label: string, at: string | null | undefined, hint: string) => {
    const old = !!at && Date.now() - Date.parse(at) > 2 * DAY_MS;
    return (
      <div className="grid gap-0.5 border-t border-line pt-3 first:border-0 first:pt-0">
        <dt className="font-semibold">{label}</dt>
        <dd className={cn('text-sm', !at ? 'text-ink-2' : old ? 'font-semibold text-danger' : 'text-ok')}>
          {k === null ? 'Sprawdzanie…' : at ? `${fmtWhen(at)}${old ? ' – ponad 2 dni temu, sprawdź log błędów' : ''}` : 'nie skonfigurowano'}
        </dd>
        <dd className="text-xs text-ink-2">{hint}</dd>
      </div>
    );
  };
  return (
    <Card title="Stan kopii" icon={Database} hint="Kopie robią się w nocy same.">
      {err ? <p className="text-sm text-danger">{err}</p> : (
        <dl className="grid gap-3">
          {row('Eksport do arkusza Google', k?.eksport, 'Codziennie o 2:30, wszystkie tabele.')}
          {row('Kopia zdjęć', k?.zdjecia, 'Codziennie o 3:00, nowe pliki do zapasowego magazynu.')}
        </dl>
      )}
    </Card>
  );
}

function ErrorLog() {
  const [list, setList] = useState<Rec[] | null>(null);
  const [all, setAll] = useState(false);
  const [err, setErr] = useState('');
  const load = () => api<Rec[]>('/api/errors').then((r) => { setList(r); setErr(''); }, (e) => setErr(msg(e)));
  useEffect(() => { void load(); }, []);
  const text = (e: Rec) => `${e.at} ${e.where}\n${e.message}`;
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Skopiowano', { tone: 'ok' }), () => toast('Nie udało się skopiować', { tone: 'error' }));
  const shown = list && (all ? list : list.slice(0, 10));
  return (
    <Card title="Log błędów" icon={Bug} hint="Najnowsze na górze. Skopiuj i wyślij, gdy coś nie działa.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void load()}>Odśwież</Button>
        {!!list?.length && <Button size="sm" variant="secondary" onClick={() => void copy(list.map(text).join('\n\n'))}><Copy className="h-4 w-4" />Kopiuj wszystko</Button>}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {list === null && !err ? <Skeleton className="h-24" /> : list?.length === 0 ? <p className="text-sm text-ink-2">Brak błędów.</p> : (
        <ol className="grid gap-2">
          {shown!.map((e) => {
            const [first, ...rest] = String(e.message).split('\n');
            return (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-ink-2"><time dateTime={e.at}>{fmtWhen(e.at)}</time> · <span className="font-mono">{e.where}</span></p>
                  <p className="text-sm font-semibold break-words">{first}</p>
                  {rest.length > 0 && (
                    <details className="text-xs text-ink-2"><summary className="cursor-pointer py-1">Szczegóły</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono">{rest.join('\n')}</pre></details>
                  )}
                </div>
                <Button variant="ghost" size="sm" aria-label="Kopiuj błąd" onClick={() => void copy(text(e))} className="w-10 px-0 text-ink-2"><Copy className="h-5 w-5 shrink-0" /></Button>
              </li>
            );
          })}
        </ol>
      )}
      {list && list.length > 10 && !all && <Button variant="ghost" onClick={() => setAll(true)}>Pokaż wszystkie ({list.length})</Button>}
    </Card>
  );
}

const DICT_LABEL: Record<string, string> = {
  status_zlecenia: 'Statusy zleceń', status_leada: 'Statusy leadów', kategoria: 'Kategorie', ekipa: 'Ekipy', zrodlo: 'Źródła leadów',
  kod_nieobecnosci: 'Kody nieobecności', grupa_zadan: 'Grupy zadań', status_zadania: 'Statusy zadań', rodzaj_zlecenia: 'Rodzaje zleceń',
  status_zakupu: 'Statusy zakupów', dzien_wolny: 'Dni wolne (RRRR-MM-DD)',
};
// Wartości, na których polega aplikacja (pozycja albo nazwa).
const DICT_HINT: Record<string, string> = {
  status_leada: '4. wartość oznacza lead przyjęty („Zrób zlecenie” → Przyjęta).',
  status_zadania: '„Zrobione” zamyka zadanie; pierwsza wartość to status nowego zadania.',
  status_zakupu: 'Dokładnie dwie wartości: pierwsza = do kupienia, druga = kupione.',
  ekipa: '„mieszane” to zlecenie dla kilku ekip.',
  dzien_wolny: 'Dodatkowe dni wolne poza świętami, np. 2026-12-24.',
};
const GRUPA_LABEL: Record<string, string> = { aktualne: 'Aktualne', pozniej: 'Na później', zamkniete: 'Zamknięte' };
/** „rekordzie / rekordach” po liczbie. */
const recs = (n: number) => (n === 1 ? 'rekordzie' : 'rekordach');
const WITH_GRUPA = new Set(['status_zlecenia', 'status_leada']);
const WITH_KOLOR = new Set(['kategoria', 'kod_nieobecnosci']);
type Item = { key: string; id?: string; wartosc: string; grupa: string | null; kolor: string | null; platne: boolean | null };

/** Edytor słowników: pełna lista wartości rodzaju, zapis jednym PUT (usunięte znikają miękko). */
function Dictionaries() {
  const dict = useEntities('dict');
  const [rodzaj, setRodzaj] = useState<string>('kategoria');
  const saved = useMemo(() => dict.filter((d) => d.rodzaj === rodzaj).sort((a, b) => a.kolejnosc - b.kolejnosc)
    .map((d): Item => ({ key: d.id, id: d.id, wartosc: d.wartosc, grupa: d.grupa ?? null, kolor: d.kolor ?? null, platne: d.platne ?? null })), [dict, rodzaj]);
  const [items, setItems] = useState<Item[] | null>(null); // null = bez zmian (pokazujemy zapisane)
  const [nowa, setNowa] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const list = items ?? saved;
  const edit = (next: Item[]) => { setItems(next); setErr(''); };
  const patch = (i: number, p: Partial<Item>) => edit(list.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const switchTo = (r: string) => { setRodzaj(r); setItems(null); setErr(''); setNowa(''); };

  function add(e: FormEvent) {
    e.preventDefault();
    const w = nowa.trim();
    if (!w) return;
    if (list.some((x) => x.wartosc === w)) return setErr('Taka wartość już jest');
    edit([...list, { key: `n${Date.now()}`, wartosc: w, grupa: WITH_GRUPA.has(rodzaj) ? 'aktualne' : null, kolor: WITH_KOLOR.has(rodzaj) ? '#8896a5' : null, platne: rodzaj === 'kod_nieobecnosci' ? true : null }]);
    setNowa('');
  }
  async function save() {
    const vals = list.map((x) => x.wartosc.trim());
    if (vals.some((v) => !v)) return setErr('Wartość nie może być pusta');
    if (new Set(vals).size !== vals.length) return setErr('Wartości w słowniku muszą być różne');
    setBusy(true);
    try {
      const rows = await api<Rec[]>(`/api/dict/${rodzaj}`, { method: 'PUT', json: { items: list.map((x, i) => ({ id: x.id, wartosc: vals[i], grupa: x.grupa, kolor: x.kolor, platne: x.platne })) } });
      const keep = new Set(rows.map((r) => r.id));
      for (const d of dict) if (d.rodzaj === rodzaj && !keep.has(d.id)) store.remove('dict', d.id);
      for (const r of rows) store.put('dict', r);
      setItems(null);
      toast('Słownik zapisany', { tone: 'ok' });
    } catch (x) {
      const b = x instanceof ApiError ? (x.body as { error?: string; value?: string; count?: number } | null) : null;
      setErr(b?.error === 'WARTOSC_W_UZYCIU' ? `„${b.value}” jest używana w ${b.count} ${recs(b.count ?? 0)} – zmień nazwę zamiast usuwać` : msg(x));
    }
    setBusy(false);
  }

  return (
    <Card title="Słowniki" icon={BookOpen} hint="Listy wyboru w formularzach. Zmiana nazwy zmienia ją też we wszystkich zapisanych rekordach. Wartości w użyciu nie da się usunąć.">
      <Field label="Słownik">{(id) => <Select id={id} value={rodzaj} onValueChange={switchTo} options={DICT_RODZAJE.map((r) => ({ value: r, label: DICT_LABEL[r] ?? r }))} />}</Field>
      {DICT_HINT[rodzaj] && <p className="rounded-xl bg-action/8 px-3 py-2 text-sm">{DICT_HINT[rodzaj]}</p>}
      <ol className="grid gap-2" aria-label={`Wartości: ${DICT_LABEL[rodzaj]}`}>
        {list.map((x, i) => (
          <li key={x.key} className="grid gap-2 rounded-xl border border-line p-2">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-0.5 min-[560px]:gap-1">
              {WITH_KOLOR.has(rodzaj) && (
                <input type="color" aria-label={`Kolor: ${x.wartosc}`} value={x.kolor ?? '#8896a5'} onChange={(e) => patch(i, { kolor: e.target.value })}
                  className="h-10 w-9 min-[560px]:w-10 cursor-pointer rounded-lg border border-line bg-card p-1" />
              )}
              <Input aria-label={`Wartość ${i + 1}`} value={x.wartosc} onChange={(e) => patch(i, { wartosc: e.target.value })} className={cn('h-11', !WITH_KOLOR.has(rodzaj) && 'col-span-2')} />
              <Button variant="ghost" size="iconTight" aria-label={`W górę: ${x.wartosc}`} disabled={i === 0} onClick={() => edit(move(list, i, -1))}><ArrowUp className="h-5 w-5" /></Button>
              <Button variant="ghost" size="iconTight" aria-label={`W dół: ${x.wartosc}`} disabled={i === list.length - 1} onClick={() => edit(move(list, i, 1))}><ArrowDown className="h-5 w-5" /></Button>
              <Button variant="ghost" size="iconTight" aria-label={`Usuń: ${x.wartosc}`} onClick={() => edit(list.filter((_, k) => k !== i))} className="text-danger"><Trash className="h-5 w-5" /></Button>
            </div>
            {(WITH_GRUPA.has(rodzaj) || rodzaj === 'kod_nieobecnosci') && (
              <div className="flex flex-wrap items-center gap-3 pl-1">
                {WITH_GRUPA.has(rodzaj) && (
                  <div className="w-48"><Select aria-label={`Grupa: ${x.wartosc}`} value={x.grupa ?? 'aktualne'} onValueChange={(grupa) => patch(i, { grupa })} options={DICT_GRUPY.map((g) => ({ value: g, label: GRUPA_LABEL[g] ?? g }))} className="h-10 text-sm" /></div>
                )}
                {rodzaj === 'kod_nieobecnosci' && (
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
                    <Checkbox checked={!!x.platne} onCheckedChange={(v) => patch(i, { platne: v === true })} aria-label={`Płatne: ${x.wartosc}`} />Płatne
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
        {!list.length && <li className="text-sm text-ink-2">Pusty słownik.</li>}
      </ol>
      <form onSubmit={add} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input aria-label="Nowa wartość" value={nowa} onChange={(e) => setNowa(e.target.value)} placeholder="Nowa wartość" />
        <Button type="submit" variant="secondary"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
      </form>
      {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        {items && <Button variant="secondary" onClick={() => switchTo(rodzaj)}>Cofnij zmiany</Button>}
        <Button onClick={() => void save()} disabled={!items || busy}>{busy ? 'Zapisywanie…' : 'Zapisz słownik'}</Button>
      </div>
    </Card>
  );
}
