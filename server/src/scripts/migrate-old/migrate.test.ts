import { count } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDeps } from '../../test-utils.js';
import { changes, users } from '../../core/schema-base.js';
import * as harmonogram from '../../modules/harmonogram/service.js';
import { clients, sites } from '../../modules/klienci/schema.js';
import * as klienci from '../../modules/klienci/service.js';
import * as leady from '../../modules/leady/service.js';
import { seedBase } from '../../modules/slowniki/seed.js';
import * as slowniki from '../../modules/slowniki/service.js';
import * as uzytkownicy from '../../modules/uzytkownicy/service.js';
import * as zadania from '../../modules/zadania/service.js';
import * as zakupy from '../../modules/zakupy/service.js';
import * as zlecenia from '../../modules/zlecenia/service.js';
import { fixtureXlsx, oldFixture } from './fixtures.js';
import { readOld } from './read-xlsx.js';
import { reviewCsv } from './report.js';
import { migrate } from './run.js';
import { kontakt, termin, transform } from './transform.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const fresh = () => { const { db } = testDeps(); seedBase(db); return db; };
type Db = ReturnType<typeof fresh>;
const migrated = async () => { const db = fresh(); const out = await migrate(db, oldFixture(), { dryRun: false, now: NOW }); return { db, ...out }; };

const jobOf = (db: Db, nazwa: string, kategoria?: string) =>
  zlecenia.list(db).filter((j) => klienci.get(db, j.clientId)!.nazwa === nazwa && (!kategoria || j.kategoria === kategoria));
const cell = (db: Db, dzien: string, osoba: string) => {
  const p = uzytkownicy.listPeople(db).find((x) => x.nazwa === osoba)!;
  return harmonogram.range(db, dzien, dzien, false).days[0]!.entries.filter((e) => e.personId === p.id).sort((a, b) => a.slot - b.slot);
};
const label = (db: Db, e: { jobId: string | null }) => klienci.get(db, zlecenia.get(db, e.jobId!)!.clientId)!.nazwa;

describe('readOld', () => {
  it('odczyt pliku atrapy daje to samo co oldFixture()', async () => {
    expect(await readOld(await fixtureXlsx())).toEqual(oldFixture());
  });
});

describe('transform', () => {
  it('kontakt z jednej komórki i termin „miesiąc rrrr”', () => {
    expect(kontakt('tel. 600 111 222; p.zielinski@example.com')).toEqual({ telefony: ['600 111 222'], emaile: ['p.zielinski@example.com'], reszta: '' });
    expect(kontakt('+48727728903 wieczorem').telefony).toEqual(['+48727728903']);
    expect(kontakt('+48727728903 wieczorem').reszta).toBe('wieczorem');
    expect([termin('październik 2026'), termin('Styczeń 2027'), termin('kiedyś'), termin(''), termin('wkrótce')]).toEqual(['2026-10', '2027-01', null, null, undefined]);
  });

  it('dopisuje do słowników brakujące wartości arkusza z grupą sekcji, „Planowane” = „Zaplanowane”', () => {
    const db = fresh();
    const plan = transform(oldFixture(), slowniki.listAll(db));
    const add = (r: string) => plan.slowniki.filter((s) => s.rodzaj === r).map((s) => [s.wartosc, s.grupa ?? s.platne ?? null]);
    expect(add('status_zlecenia')).toEqual([['Do rozliczenia', 'zamkniete']]);
    expect(add('status_leada')).toEqual([['Do wyceny', 'aktualne']]);
    expect(add('kod_nieobecnosci')).toEqual([['bezpłatny', false], ['okolicznościowy', true]]);
    expect(add('kategoria')).toEqual([]); // nazwy z zadania 19i są w słowniku
    expect(plan.zlecenia.some((z) => z.status === 'Zaplanowane')).toBe(true);
  });
});

describe('migrate (atrapa)', () => {
  it('dwa zlecenia z telefonem „727 728 903” i „+48727728903” → jeden klient z jednym telefonem', async () => {
    const { db } = await migrated();
    const kow = db.select().from(clients).all().filter((c) => c.nazwa === 'Jan Kowalski');
    expect(kow).toHaveLength(1);
    expect(kow[0]!.telefony).toEqual(['727 728 903']);
    expect(jobOf(db, 'Jan Kowalski')).toHaveLength(2);
    expect(db.select().from(sites).all().filter((s) => s.clientId === kow[0]!.id).map((s) => s.miejscowosc)).toEqual(['Zawoja']);
  });

  it('ten sam telefon w leadzie (zapis bez odstępów) i lead przyjęty jako zlecenie → ten sam klient, zlecenie z leadem', async () => {
    const { db } = await migrated();
    const ziel = db.select().from(clients).all().filter((c) => c.nazwa.includes('Zieliński'));
    const byTemat = (t: string) => leady.list(db).find((l) => l.temat === t)!;
    expect(byTemat('Jordanów / instalacja w garażu').clientId).toBe(jobOf(db, 'Piotr Zieliński', 'Smart home')[0]!.clientId);
    // drugie zlecenie Zielińskiego bez telefonu: osobny klient i pozycja do przejrzenia
    expect(ziel).toHaveLength(2);
    const lis = byTemat('Skawica / klima 2 split');
    const job = jobOf(db, 'Tomasz Lis')[0]!;
    expect([lis.clientId, lis.siteId]).toEqual([job.clientId, job.siteId]);
    expect(job.leadId).toBe(lis.id);
  });

  it('„Kowalski / Nowak” → dwa sloty po pół dnia z właściwymi zleceniami; kody po początku tekstu', async () => {
    const { db } = await migrated();
    const e = cell(db, '2026-10-07', 'Adam');
    expect(e.map((x) => [x.rodzaj, x.polDnia, label(db, x)])).toEqual([['zlecenie', true, 'Jan Kowalski'], ['zlecenie', true, 'Nowak']]);
    expect(label(db, cell(db, '2026-10-05', 'Adam')[0]!)).toBe('Jan Kowalski');
    expect(zlecenia.get(db, cell(db, '2026-10-05', 'Czarek')[0]!.jobId!)!.kategoria).toBe('Klimatyzacja'); // „Zawoja klima”, nie „Kowalski”
    const kod = (d: string, o: string) => cell(db, d, o).map((x) => x.kod);
    expect([kod('2026-10-08', 'Adam'), kod('2026-10-09', 'Adam'), kod('2026-10-07', 'Bartek'), kod('2026-10-07', 'Czarek'), kod('2026-10-07', 'Darek')])
      .toEqual([['urlop'], ['UŻ'], ['szkolenie'], ['bezpłatny'], ['okolicznościowy']]);
    expect(harmonogram.drafts(db)).toEqual([]);
    expect(harmonogram.range(db, '2026-10-05', '2026-10-05', false).days[0]!.note).toBe('Adam: Zawoja 2 dni');
  });

  it('literówka w haśle → tekst + pozycja „do przejrzenia”; osoby spoza płac pominięte', async () => {
    const { db, report } = await migrated();
    expect(cell(db, '2026-10-08', 'Bartek').map((x) => [x.rodzaj, x.tekst])).toEqual([['tekst', 'Nowk']]);
    expect(report.doPrzejrzenia.some((r) => r.co === 'harmonogram' && r.opis.includes('„Nowk”') && !r.pominiete)).toBe(true);
    expect(report.doPrzejrzenia.find((r) => r.opis.includes('„magazyn”'))!.ile).toBe(2);
    expect(uzytkownicy.listPeople(db).map((p) => p.nazwa)).toEqual(['Adam', 'Bartek', 'Czarek', 'Darek']);
    expect(db.select().from(users).all().map((u) => [u.login, u.role, u.ekipa])).toEqual([
      ['adam', 'pracownik', 'ekipa Adam'], ['bartek', 'pracownik', 'ekipa Bartek'], ['czarek', 'pracownik', null], ['darek', 'pracownik', null]]);
  });

  it('decyzje właściciela: kategorie z kodów, H → Inne, „Do rozliczenia” zamknięte, rodzaj pusty, numery w kolejności daty', async () => {
    const { db } = await migrated();
    const js = zlecenia.list(db);
    expect(jobOf(db, 'Anna Wiśniewska')[0]!.kategoria).toBe('Inne');
    expect(jobOf(db, 'Nowak')[0]!.kategoria).toBe('Rekuperacja');
    const dudek = jobOf(db, 'Józef Dudek')[0]!;
    expect([dudek.status, slowniki.groupOf(db, 'status_zlecenia', dudek.status), dudek.zamknieteAt]).toEqual(['Do rozliczenia', 'zamkniete', '2026-10-20T12:00:00.000Z']);
    expect(js.every((j) => j.rodzaj === '')).toBe(true);
    // pierwszy dzień w harmonogramie, inaczej miesiąc terminu: Kamińska (sierpień) Z0001, potem zlecenia od 5.10; bez daty na końcu
    const byNum = [...js].sort((a, b) => a.numer.localeCompare(b.numer)).map((j) => klienci.get(db, j.clientId)!.nazwa);
    expect(byNum.slice(0, 3)).toEqual(['Ewa Kamińska', 'Jan Kowalski', 'Nowak']);
    expect(byNum.at(-1)).toBe('Piotr Zieliński');
  });

  it('zadania bez grup form i fi, zakupy: „Zamówione” → Do kupienia, reszta pól w uwagach', async () => {
    const { db } = await migrated();
    const ts = zadania.list(db);
    expect(ts.map((t) => t.tekst).sort()).toEqual(['Instrukcja centrali', 'Kupić nową drukarkę', 'Odnowić ubezpieczenie OC', 'Przegląd samochodów', 'Uzupełnić wycenę dla Mazura', 'Zadzwonić do hurtowni w sprawie rabatu']);
    expect(ts.find((t) => t.tekst === 'Przegląd samochodów')!.cykliczne).toBe(true);
    const zs = zakupy.list(db);
    expect(zs.find((z) => z.co === 'Pompa skroplin')).toMatchObject({ status: 'Do kupienia', uwagi: 'dostawa w piątek; Sklep: Allegro; Grupa: Osprzęt klima; Kwota: 249,99 zł; Zamówione' });
    expect(zs.find((z) => z.co === 'Klucz dynamometryczny')).toMatchObject({ status: 'Kupione', kupioneAt: '2026-09-15T12:00:00.000Z' });
  });

  it('kontakty z historii przy leadzie, wpis testowy pominięty', async () => {
    const { db } = await migrated();
    const mazur = leady.list(db).find((l) => l.temat === 'Sucha – klimatyzacja biura')!;
    expect(leady.contactsOf(db, mazur.id).map((c) => [c.dzien, c.notatka])).toEqual([['2026-10-10', 'prosi o wycenę dwóch jednostek']]);
    expect([mazur.ostatni, mazur.nastepny]).toEqual(['2026-10-10', '2026-11-05']);
    expect(leady.list(db).find((l) => l.temat === 'Rekuperacja w nowym domu')!.uwagi).toBe('Ostatni kontakt 02.09.2026: zadzwoni po zimie');
  });

  it('raport: każda liczba w źródle = w bazie, poza pominiętymi z listy „do przejrzenia”', async () => {
    const { report } = await migrated();
    expect(report.wiersze.every((w) => w.roznica === 0)).toBe(true);
    const w = Object.fromEntries(report.wiersze.map((x) => [x.co, [x.zrodlo, x.baza, x.pominiete]]));
    expect(w['Zadania i notatki']).toEqual([8, 6, 2]);
    expect(w['Harmonogram – komórki osób']).toEqual([22, 20, 2]);
    expect(w['Osoby w harmonogramie']).toEqual([6, 4, 2]);
    expect(w['Kontakty z leadami']).toEqual([2, 1, 1]);
    expect(reviewCsv(report.doPrzejrzenia).split('\r\n')[0]).toBe('﻿Arkusz;Wiersz;Dotyczy;Ile;Przeniesiono;Opis');
  });

  it('--dry-run nic nie zapisuje, a raport i loginy są te same', async () => {
    const db = fresh();
    const n = () => [clients, users, changes].map((t) => db.select({ n: count() }).from(t).get()!.n);
    const before = n();
    const dry = await migrate(db, oldFixture(), { dryRun: true, now: NOW });
    expect(n()).toEqual(before);
    expect(dry.konta.every((k) => k.haslo === '')).toBe(true);
    const real = await migrate(db, oldFixture(), { dryRun: false, now: NOW });
    expect(real.report).toEqual(dry.report);
    expect(real.konta.map((k) => k.login)).toEqual(['adam', 'bartek', 'czarek', 'darek']);
    expect(dry.konta.map((k) => k.login)).toEqual(real.konta.map((k) => k.login));
    expect(real.konta.every((k) => k.haslo.length >= 8)).toBe(true);
    await expect(migrate(db, oldFixture(), { dryRun: true, now: NOW })).rejects.toThrow(/Baza nie jest pusta/);
  });
});
