import { and, count, eq } from 'drizzle-orm';
import { dayOf, dictPutSchema, type DictRodzaj, type ScheduleSlot } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { users } from '../../core/schema-base.js';
import * as harmonogram from '../../modules/harmonogram/service.js';
import { clients } from '../../modules/klienci/schema.js';
import * as klienci from '../../modules/klienci/service.js';
import { leadContacts, leads } from '../../modules/leady/schema.js';
import * as przeniesienie from '../../modules/przeniesienie/service.js';
import * as leady from '../../modules/leady/service.js';
import * as slowniki from '../../modules/slowniki/service.js';
import * as uzytkownicy from '../../modules/uzytkownicy/service.js';
import * as zadania from '../../modules/zadania/service.js';
import { shopping } from '../../modules/zakupy/schema.js';
import * as zakupy from '../../modules/zakupy/service.js';
import { jobs } from '../../modules/zlecenia/schema.js';
import * as zakres from '../../modules/zlecenia/scope.js';
import * as zlecenia from '../../modules/zlecenia/service.js';
import type { Plan } from './transform.js';

const site = (miejscowosc: string) => ({ nazwa: '', adres: '', miejscowosc, mapa: '', opis: '' });
/** Chwila dla daty z arkusza (południe UTC = ten sam dzień w Polsce). */
const at = (d: string) => `${d}T12:00:00.000Z`;

/**
 * Daty z arkusza w polach, które serwisy ustawiają same (chwila zapisu): zamknięcie leada/zlecenia, zakup, status i plan kontaktu.
 * shortcut: wprost w tabeli + wpis w changes; gdyby serwisy dostały takie pola, przejść na nie.
 */
function patch<T extends typeof leads | typeof jobs | typeof shopping | typeof leadContacts>(db: Db, by: string, table: T, entity: string, id: string, set: Partial<T['$inferInsert']>): void {
  const old = db.select().from(table as typeof leads).where(eq((table as typeof leads).id, id)).get();
  const row = db.update(table as typeof leads).set({ ...set, updatedAt: new Date().toISOString() } as never).where(eq((table as typeof leads).id, id)).returning().get();
  recordChange(db, by, entity, id, 'update', old, row);
}

/** Pierwszy aktywny administrator = autor zapisów przeniesienia (created_by wskazuje istniejące konto). */
export const author = (db: Db): string | undefined =>
  db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.active, true))).limit(1).get()?.id;

export class NotEmptyError extends Error {}

/** Baza docelowa musi być bez danych firmy (dopuszczalne: słowniki, administratorzy). */
export function assertEmpty(db: Db): void {
  const busy = zlecenia.list(db).length + leady.list(db).length + uzytkownicy.listPeople(db).length + zadania.list(db).length + zakupy.list(db).length
    + db.select({ n: count() }).from(clients).get()!.n;
  if (busy) throw new NotEmptyError('Baza nie jest pusta (są zlecenia, leady, klienci, osoby harmonogramu, zadania albo zakupy). Przeniesienie tylko do nowej bazy.');
}

/**
 * Zapis planu przez serwisy modułów (wywołuj w tx). `hashes[i]` = skrót hasła startowego osoby `plan.osoby[i]`.
 * Zwraca loginy kont (przy zajętym loginie dopisuje cyfrę).
 */
export function apply(db: Db, plan: Plan, o: { hashes: string[]; now: Date }): { logins: string[] } {
  assertEmpty(db);
  const by = author(db);
  if (!by) throw new Error('W bazie nie ma administratora. Najpierw: pnpm --filter @etner/server create-admin --login … --name …');
  const today = dayOf(o.now);

  // Słowniki: dopisane wartości na końcu list (istniejące zostają bez zmian).
  const rodzaje = [...new Set(plan.slowniki.map((s) => s.rodzaj))] as DictRodzaj[];
  for (const r of rodzaje) {
    const have = slowniki.list(db, r).map(({ id, wartosc, grupa, platne, kolor }) => ({ id, wartosc, grupa, platne, kolor }));
    const { items } = dictPutSchema.parse({ items: [...have, ...plan.slowniki.filter((s) => s.rodzaj === r).map(({ wartosc, grupa, platne }) => ({ wartosc, grupa, platne }))] });
    slowniki.replace(db, by, r, items);
  }

  // Osoby z listy płac: konto pracownika + kolumna harmonogramu w kolejności arkusza.
  const logins: string[] = [];
  const people = plan.osoby.map((p, i) => {
    let user: uzytkownicy.PublicUser | undefined;
    let login = p.login;
    for (let n = 2; !user; n++) {
      try {
        user = uzytkownicy.create(db, by, { login, passwordHash: o.hashes[i]!, name: p.nazwa, role: 'pracownik', perms: [], ekipa: p.ekipa });
      } catch (e) {
        if (!(e instanceof uzytkownicy.LoginTakenError)) throw e;
        login = `${p.login}${n}`;
      }
    }
    logins.push(login);
    return uzytkownicy.createPerson(db, by, { nazwa: p.nazwa, userId: user.id, kolejnosc: i }).id;
  });

  // Klienci i obiekty (miejscowość).
  const cl = plan.klienci.map((c) => {
    const r = klienci.create(db, by, { typ: c.typ, nazwa: c.nazwa, telefony: c.telefony, emaile: c.emaile, nip: '', notatki: c.notatki, site: c.obiekty[0] ? site(c.obiekty[0]) : undefined });
    const sites = new Map<string, string>();
    if (r.site) sites.set(c.obiekty[0]!, r.site.id);
    for (const m of c.obiekty.slice(1)) sites.set(m, klienci.addSite(db, by, r.client.id, site(m))!.id);
    return { id: r.client.id, sites };
  });

  // Leady z kontaktami (dzień kontaktu z arkusza); daty zamknięcia z arkusza zamiast chwili przeniesienia.
  const leadIds = plan.leady.map((l) => {
    const c = l.klient === null ? undefined : cl[l.klient];
    const row = leady.save(db, by, {
      clientId: c?.id ?? null, siteId: (l.obiekt && c?.sites.get(l.obiekt)) || null, status: l.status, kategoria: l.kategoria, temat: l.temat,
      zrodlo: l.zrodlo, opis: l.opis, wartoscGr: l.wartoscGr, nastepny: '', uwagi: l.uwagi,
    })!;
    for (const k of l.kontakty) {
      const { contact } = leady.contact(db, by, row.id, k.notatka, k.nastepny || undefined, k.dzien)!;
      patch(db, by, leadContacts, 'lead_contacts', contact.id, { status: k.status, plan: k.plan, ...(k.zapisano && { createdAt: k.zapisano }) });
    }
    leady.save(db, by, { id: row.id, nastepny: l.nastepny });
    if (l.zamknieto && leady.get(db, row.id)?.zamknieteAt) patch(db, by, leads, 'leads', row.id, { zamknieteAt: at(l.zamknieto) });
    return row.id;
  });

  // Zlecenia w kolejności planu (nowe numery w kolejności daty), rodzaj pusty, zakres jako pierwszy punkt.
  const jobIds = plan.zlecenia.map((z) => {
    const c = cl[z.klient]!;
    const row = zlecenia.save(db, by, {
      clientId: c.id, siteId: (z.obiekt && c.sites.get(z.obiekt)) || null, leadId: z.lead === null ? null : leadIds[z.lead]!,
      status: z.status, kategoria: z.kategoria, termin: z.termin, ekipa: z.ekipa, rodzaj: '', uwagiAdmin: z.uwagiAdmin,
    })!;
    if (z.zakres) zakres.create(db, by, row.id, { tekst: z.zakres.slice(0, 5000), uploads: [] });
    if (z.zamknieto && row.zamknieteAt) patch(db, by, jobs, 'jobs', row.id, { zamknieteAt: at(z.zamknieto) });
    return row.id;
  });

  // Harmonogram: szkice komórek i uwag dnia, potem jedno zatwierdzenie (powiadomienia odrzucone).
  for (const h of plan.harmonogram) {
    const value = h.sloty.map((s): ScheduleSlot => (s.rodzaj === 'zlecenie' ? { rodzaj: 'zlecenie', jobId: jobIds[s.zlecenie]!, polDnia: s.polDnia } : s));
    harmonogram.setDraft(db, by, { from: h.dzien, to: h.dzien, people: [people[h.osoba]!], value, workdaysOnly: false });
  }
  for (const u of plan.uwagiDnia) harmonogram.setDraft(db, by, { from: u.dzien, to: u.dzien, people: ['uwagi'], value: { tekst: u.tekst }, workdaysOnly: false });
  harmonogram.approve(db, by, undefined, o.now);

  for (const t of plan.zadania) zadania.save(db, by, { ...t, status: t.status || undefined }, today);

  for (const z of plan.zakupy) {
    const r = zakupy.create(db, by, { co: z.co, uwagi: z.uwagi });
    if (!z.kupione) continue;
    zakupy.update(db, by, r.id, { status: 'Kupione' });
    if (z.kupiono) patch(db, by, shopping, 'shopping', r.id, { kupioneAt: at(z.kupiono) });
  }

  przeniesienie.add(db, by, plan.doPrzejrzenia.map(({ co, arkusz, wiersz, dzien, osoba, tekst, opis, ile, pominiete }) => ({ co, arkusz, wiersz, dzien, osoba, tekst, opis, ile, pominiete })));
  checkDict(db, plan);
  return { logins };
}

/** Każda wartość słownikowa zapisana w rekordach musi być w słowniku (inaczej transakcja się wycofuje). */
function checkDict(db: Db, plan: Plan): void {
  const used: [DictRodzaj, string | null][] = [
    ...plan.zlecenia.flatMap((z): [DictRodzaj, string | null][] => [['status_zlecenia', z.status], ['kategoria', z.kategoria], ['ekipa', z.ekipa]]),
    ...plan.leady.flatMap((l): [DictRodzaj, string | null][] => [['status_leada', l.status], ['kategoria', l.kategoria], ['zrodlo', l.zrodlo], ...l.kontakty.map((k): [DictRodzaj, string] => ['status_leada', k.status])]),
    ...plan.osoby.map((o): [DictRodzaj, string | null] => ['ekipa', o.ekipa]),
    ...plan.harmonogram.flatMap((h) => h.sloty.flatMap((s): [DictRodzaj, string][] => (s.rodzaj === 'kod' ? [['kod_nieobecnosci', s.kod]] : []))),
    ...plan.zadania.flatMap((t): [DictRodzaj, string][] => [['grupa_zadan', t.grupa], ['status_zadania', t.status]]),
  ];
  const missing = [...new Set(used.filter(([r, v]) => v && !slowniki.list(db, r).some((d) => d.wartosc === v)).map(([r, v]) => `${r}: ${v}`))];
  if (missing.length) throw new Error(`Wartości spoza słowników: ${missing.join(', ')}`);
}
