import { ArrowDown, ArrowUp, CalendarDots, CaretRight, Copy, EnvelopeSimple, Key, Plus, ShareNetwork, Trash, UserPlus, UsersThree } from '@phosphor-icons/react';
import { useMemo, useState, type FormEvent } from 'react';
import { loginSchema } from '@etner/shared';
import { ApiError, api } from '../../core/api.js';
import { useDict, useLoading, useMe } from '../../core/data.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty, SectionTitle, Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { genPassword, move } from './model.js';

// Ekran admina: zapisy idą wprost do serwera (bez kolejki offline), bo hasło startowe trzeba pokazać od razu.
const NONE = '-';
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');
const fail = (t: string) => (e: unknown) => toast(t, { body: msg(e), tone: 'error' });
async function send<T extends Rec>(entity: string, url: string, method: string, json?: unknown): Promise<T> {
  const r = await api<T>(url, { method, json });
  store.put(entity, r);
  return r;
}
const byOrder = (a: Rec, b: Rec) => (a.kolejnosc ?? 0) - (b.kolejnosc ?? 0) || String(a.nazwa).localeCompare(String(b.nazwa), 'pl');

type Shown = { title: string; name: string; login: string; haslo: string; note?: string };

/** Użytkownicy (admin): konta, hasła startowe, e-mail do Pumble, wiersze harmonogramu. */
export function Uzytkownicy() {
  const users = useEntities('users');
  const people = useEntities('schedule_people');
  const loading = useLoading();
  const [form, setForm] = useState<Rec | 'new' | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const sorted = useMemo(() => [...users].sort((a, b) => Number(!a.active) - Number(!b.active) || String(a.name).localeCompare(String(b.name), 'pl')), [users]);
  const rowOf = useMemo(() => new Set(people.map((p) => p.userId).filter(Boolean)), [people]);

  if (loading) return <div className="mx-auto grid max-w-5xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie użytkowników">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-4 py-4 desk:grid-cols-[minmax(0,1fr)_400px] desk:items-start desk:py-6">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle count={users.length}>Konta</SectionTitle>
          <Button onClick={() => setForm('new')}><UserPlus className="h-5 w-5" />Nowy użytkownik</Button>
        </div>
        {!users.length && <Empty icon={UsersThree} title="Nie ma użytkowników" />}
        <ul className="grid gap-2">
          {sorted.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setForm(u)} className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left hover:border-ink-2', !u.active && 'opacity-70')}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    {u.role === 'admin' && <Badge tone="ink">Administrator</Badge>}
                    {(u.perms as string[] | undefined)?.includes('finanse') && <Badge tone="action">finanse</Badge>}
                    {!u.active && <Badge tone="warn">nieaktywny</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-2">{[u.login ? `login: ${u.login}` : 'bez loginu', u.role === 'admin' ? null : 'Pracownik', u.ekipa].filter(Boolean).join(' · ')}</span>
                  <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className={cn('inline-flex min-w-0 items-center gap-1.5', !u.email && 'text-ink-2')}><EnvelopeSimple className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{u.email || 'bez e-maila (Pumble)'}</span></span>
                    <span className={cn('inline-flex items-center gap-1.5', !rowOf.has(u.id) && 'text-ink-2')}><CalendarDots className="h-4 w-4 shrink-0" aria-hidden />{rowOf.has(u.id) ? 'wiersz w harmonogramie' : 'bez wiersza'}</span>
                  </span>
                </span>
                <CaretRight className="h-5 w-5 text-ink-2" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <ScheduleColumns />
      {form && <UserForm user={form === 'new' ? undefined : form} onClose={() => setForm(null)} onShow={(s) => { setForm(null); setShown(s); }} />}
      {shown && <Credentials s={shown} onClose={() => setShown(null)} />}
    </section>
  );
}

function UserForm({ user, onClose, onShow }: { user?: Rec; onClose: () => void; onShow: (s: Shown) => void }) {
  const me = useMe();
  const self = user?.id === me?.id;
  const ekipy = useDict('ekipa').filter((e) => e.wartosc !== 'mieszane');
  const people = useEntities('schedule_people');
  const linked = user ? people.find((p) => p.userId === user.id) : undefined;
  const [f, setF] = useState({
    name: (user?.name as string) ?? '', login: (user?.login as string) ?? '', haslo: '', role: (user?.role as 'admin' | 'pracownik') ?? 'pracownik',
    finanse: !!(user?.perms as string[] | undefined)?.includes('finanse'), ekipa: (user?.ekipa as string) || NONE, email: (user?.email as string) ?? '',
    active: user ? !!user.active : true, row: user ? !!linked : true,
  });
  const [rowTouched, setRowTouched] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = 'Podaj imię i nazwisko';
    const login = loginSchema.safeParse(f.login);
    if (!login.success) er.login = login.error.issues[0]!.message;
    if (!user && f.haslo.length < 8) er.haslo = 'Hasło musi mieć co najmniej 8 znaków';
    setErr(er);
    if (Object.keys(er).length) return;
    const perms = [...((user?.perms as string[] | undefined) ?? []).filter((p) => p !== 'finanse'), ...(f.role === 'admin' && f.finanse ? ['finanse'] : [])];
    const body = { name: f.name.trim(), login: login.data ?? '', role: f.role, perms, ekipa: f.ekipa === NONE ? null : f.ekipa, email: f.email.trim() };
    setBusy(true);
    try {
      const u = user ? await send('users', `/api/users/${user.id}`, 'PUT', { ...body, active: f.active })
        : (await api<{ user: Rec }>('/api/users', { method: 'POST', json: { ...body, haslo: f.haslo } })).user;
      store.put('users', u);
      if (f.row && !linked) await send('schedule_people', '/api/schedule-people', 'POST', { nazwa: body.name, userId: u.id });
      if (!f.row && linked) { await api(`/api/schedule-people/${linked.id}`, { method: 'DELETE' }); store.remove('schedule_people', linked.id); }
      if (user) { toast('Zapisano', { tone: 'ok' }); onClose(); }
      else onShow({ title: 'Konto utworzone', name: body.name, login: body.login, haslo: f.haslo, note: 'Przekaż mu login i hasło. Hasło widać tylko teraz; może je zmienić w Ustawieniach.' });
    } catch (x) {
      const code = x instanceof ApiError ? (x.body as { error?: string } | null)?.error : undefined;
      setErr(code === 'LOGIN_ZAJETY' ? { login: 'Ten login jest już zajęty' } : { form: msg(x) });
    } finally { setBusy(false); }
  }

  if (reset && user) return <ResetPassword user={user} onClose={onClose} onShow={onShow} />;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={user ? user.name : 'Nowy użytkownik'}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Imię i nazwisko" error={err.name}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.name} value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />}</Field>
          <Field label="Login" error={err.login} hint="Małe litery, cyfry, kropka, myślnik.">
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.login} value={f.login} onChange={(e) => set({ login: e.target.value })} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="np. jan.nowak" />}
          </Field>
          {!user && (
            <Field label="Hasło startowe" error={err.haslo} hint="Co najmniej 8 znaków. Pokażemy je raz po zapisaniu.">
              {(id, d) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input id={id} aria-describedby={d} aria-invalid={!!err.haslo} value={f.haslo} onChange={(e) => set({ haslo: e.target.value })} autoComplete="off" spellCheck={false} className="font-mono" />
                  <Button variant="secondary" onClick={() => set({ haslo: genPassword() })}><Key className="h-5 w-5" />Generuj</Button>
                </div>
              )}
            </Field>
          )}
          <div className="grid gap-2">
            <span className="text-sm font-semibold">Rola</span>
            <Segmented label="Rola" value={f.role} onChange={(role) => set({ role, ...(!rowTouched && !user && { row: role === 'pracownik' }) })}
              options={[{ v: 'pracownik', label: 'Pracownik' }, { v: 'admin', label: 'Administrator' }]} className={cn(self && 'pointer-events-none opacity-60')} />
            {self && <p className="text-sm text-ink-2">Nie możesz odebrać sobie roli administratora.</p>}
          </div>
          {f.role === 'admin' && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
              <Checkbox checked={f.finanse} onCheckedChange={(v) => set({ finanse: v === true })} aria-label="Uprawnienie finanse" />
              <span>Uprawnienie finanse <span className="block text-sm font-normal text-ink-2">Kwoty i rozliczenia (kolejne moduły).</span></span>
            </label>
          )}
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Ekipa">{(id) => <Select id={id} value={f.ekipa} onValueChange={(ekipa) => set({ ekipa })} options={[{ value: NONE, label: 'Bez ekipy' }, ...ekipy.map((e) => ({ value: e.wartosc as string, label: e.wartosc as string }))]} />}</Field>
            <Field label="E-mail (Pumble)" hint="Ten sam co w Pumble; po nim dodajemy go do kanałów.">
              {(id, d) => <Input id={id} aria-describedby={d} type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => set({ email: e.target.value })} />}
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
            <Checkbox checked={f.row} onCheckedChange={(v) => { setRowTouched(true); set({ row: v === true }); }} aria-label="Wiersz w harmonogramie" />
            <span>Wiersz w harmonogramie <span className="block text-sm font-normal text-ink-2">{user && linked && !f.row ? 'Wiersz zniknie z harmonogramu; jego wpisy zostają w bazie.' : 'Własny wiersz z jego pracą na każdy dzień.'}</span></span>
          </label>
          {user && (
            <label className={cn('flex min-h-11 items-center gap-3 font-semibold', self ? 'opacity-60' : 'cursor-pointer')}>
              <Checkbox checked={f.active} disabled={self} onCheckedChange={(v) => set({ active: v === true })} aria-label="Aktywny" />
              <span>Aktywny <span className="block text-sm font-normal text-ink-2">{self ? 'Nie możesz wyłączyć własnego konta.' : 'Wyłączony nie zaloguje się, jego sesje kończą się od razu.'}</span></span>
            </label>
          )}
          {err.form && <p role="alert" className="text-sm font-semibold text-danger">{err.form}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {user ? <Button variant="ghost" onClick={() => setReset(true)}><Key className="h-5 w-5" />Ustaw nowe hasło</Button> : <span />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>Anuluj</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : user ? 'Zapisz' : 'Utwórz konto'}</Button>
            </div>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

function ResetPassword({ user, onClose, onShow }: { user: Rec; onClose: () => void; onShow: (s: Shown) => void }) {
  const [haslo, setHaslo] = useState(genPassword);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (haslo.length < 8) return setErr('Hasło musi mieć co najmniej 8 znaków');
    setBusy(true);
    try {
      const r = await api<{ user: Rec }>(`/api/users/${user.id}/haslo`, { method: 'POST', json: { haslo } });
      store.put('users', r.user);
      onShow({ title: 'Nowe hasło ustawione', name: user.name, login: user.login ?? '', haslo, note: 'Wylogowaliśmy go na wszystkich urządzeniach. Przekaż mu nowe hasło; widać je tylko teraz.' });
    } catch (x) { setErr(msg(x)); setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Ustaw nowe hasło" description={user.name}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Nowe hasło" error={err}>
            {(id, d) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input id={id} aria-describedby={d} aria-invalid={!!err} value={haslo} onChange={(e) => setHaslo(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
                <Button variant="secondary" onClick={() => setHaslo(genPassword())}><Key className="h-5 w-5" />Generuj</Button>
              </div>
            )}
          </Field>
          <p className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm">Wszystkie jego sesje zostaną zakończone: na każdym urządzeniu zobaczy „Zaloguj się ponownie” i zaloguje się nowym hasłem.</p>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Ustaw hasło i wyloguj'}</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

/** Login i hasło pokazane raz, z kopiowaniem i udostępnianiem (np. SMS, Pumble). */
function Credentials({ s, onClose }: { s: Shown; onClose: () => void }) {
  const text = `ETNER – logowanie\nAdres: ${location.origin}\nLogin: ${s.login}\nHasło: ${s.haslo}`;
  const copy = () => navigator.clipboard.writeText(text).then(() => toast('Skopiowano', { tone: 'ok' }), fail('Nie udało się skopiować'));
  const canShare = typeof navigator.share === 'function';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={s.title} description={s.name}>
        <div className="grid gap-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-line bg-bg px-4 py-3">
            <dt className="text-ink-2">Login</dt><dd className="font-mono font-semibold break-all" data-testid="login">{s.login}</dd>
            <dt className="text-ink-2">Hasło</dt><dd className="font-mono text-lg font-bold tracking-wide break-all" data-testid="haslo">{s.haslo}</dd>
          </dl>
          {s.note && <p className="text-sm text-ink-2">{s.note}</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => void copy()}><Copy className="h-5 w-5" />Kopiuj</Button>
            {canShare && <Button variant="secondary" onClick={() => void navigator.share({ text }).catch(() => undefined)}><ShareNetwork className="h-5 w-5" />Udostępnij</Button>}
            <Button onClick={onClose}>Gotowe</Button>
          </div>
        </div>
      </Sheet>
    </Dialog>
  );
}

/** Kolumny (wiersze) harmonogramu: kolejność przyciskami, nazwa, powiązane konto, dodawanie i usuwanie (miękkie). */
function ScheduleColumns() {
  const raw = useEntities('schedule_people');
  const users = useEntities('users');
  const people = useMemo(() => [...raw].sort(byOrder), [raw]);
  const [nowa, setNowa] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const userOpts = [{ value: NONE, label: 'Bez konta' }, ...users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name as string }))];

  const update = (p: Rec, patch: Record<string, unknown>) => {
    store.put('schedule_people', { ...p, ...patch });
    return send('schedule_people', `/api/schedule-people/${p.id}`, 'PUT', patch).catch((e) => { store.put('schedule_people', p); fail('Zmiana nie została zapisana')(e); });
  };
  const reorder = (i: number, dir: -1 | 1) => {
    move(people, i, dir).forEach((p, k) => { if (p.kolejnosc !== k) void update(p, { kolejnosc: k }); });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const nazwa = nowa.trim();
    if (!nazwa) return;
    void send('schedule_people', '/api/schedule-people', 'POST', { nazwa, kolejnosc: people.length }).then(() => setNowa(''), fail('Nie dodano kolumny'));
  };
  const remove = (p: Rec) => {
    if (confirm !== p.id) return setConfirm(p.id);
    setConfirm(null);
    void api(`/api/schedule-people/${p.id}`, { method: 'DELETE' }).then(() => store.remove('schedule_people', p.id), fail('Nie usunięto kolumny'));
  };

  return (
    <div className="grid gap-3" aria-label="Kolumny harmonogramu" role="region">
      <SectionTitle count={people.length}>Kolumny harmonogramu</SectionTitle>
      <p className="text-sm text-ink-2">Kolejność jak w harmonogramie. Powiązane konto dostaje powiadomienia o zmianach w swoim wierszu.</p>
      <ol className="grid gap-2">
        {people.map((p, i) => (
          <li key={p.id} className="grid gap-2 rounded-2xl border border-line bg-card p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
              <NameInput p={p} onSave={(nazwa) => void update(p, { nazwa })} />
              <Button variant="ghost" size="icon" aria-label={`W górę: ${p.nazwa}`} disabled={i === 0} onClick={() => reorder(i, -1)}><ArrowUp className="h-5 w-5" /></Button>
              <Button variant="ghost" size="icon" aria-label={`W dół: ${p.nazwa}`} disabled={i === people.length - 1} onClick={() => reorder(i, 1)}><ArrowDown className="h-5 w-5" /></Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Select aria-label={`Konto: ${p.nazwa}`} value={p.userId ?? NONE} onValueChange={(v) => void update(p, { userId: v === NONE ? null : v })} options={userOpts} />
              <Button variant={confirm === p.id ? 'danger' : 'ghost'} size={confirm === p.id ? 'md' : 'icon'} aria-label={confirm === p.id ? undefined : `Usuń: ${p.nazwa}`} onClick={() => remove(p)} className={cn(confirm !== p.id && 'text-danger')}>
                {confirm === p.id ? 'Usunąć?' : <Trash className="h-5 w-5" />}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <form onSubmit={add} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input aria-label="Nowa kolumna" value={nowa} onChange={(e) => setNowa(e.target.value)} placeholder="Nowa kolumna, np. Podwykonawca" />
        <Button type="submit" variant="secondary"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
      </form>
    </div>
  );
}

function NameInput({ p, onSave }: { p: Rec; onSave: (nazwa: string) => void }) {
  const [v, setV] = useState<string>(p.nazwa);
  const save = () => { const n = v.trim(); if (!n) setV(p.nazwa); else if (n !== p.nazwa) onSave(n); };
  return <Input aria-label={`Nazwa kolumny: ${p.nazwa}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLInputElement).blur())} className="font-semibold" />;
}
