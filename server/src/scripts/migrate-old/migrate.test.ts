import { count } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { addUser, testDeps } from '../../test-utils.js';
import { changes, users } from '../../core/schema-base.js';
import { tx } from '../../core/db.js';
import * as harmonogram from '../../modules/harmonogram/service.js';
import { clients, sites } from '../../modules/klienci/schema.js';
import * as klienci from '../../modules/klienci/service.js';
import * as leady from '../../modules/leady/service.js';
import * as przeniesienie from '../../modules/przeniesienie/service.js';
import { seedBase } from '../../modules/slowniki/seed.js';
import * as slowniki from '../../modules/slowniki/service.js';
import * as uzytkownicy from '../../modules/uzytkownicy/service.js';
import * as zadania from '../../modules/zadania/service.js';
import * as zakupy from '../../modules/zakupy/service.js';
import * as zlecenia from '../../modules/zlecenia/service.js';
import { apply } from './apply.js';
import { fixtureXlsx, oldFixture } from './fixtures.js';
import type { OldData } from './old-data.js';
import { readOld } from './read-xlsx.js';
import { reviewCsv } from './report.js';
import { migrate } from './run.js';
import { kontakt, termin, transform, warsawIso, wordHit } from './transform.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const fresh = (admin = true) => { const deps = testDeps(); seedBase(deps.db); if (admin) addUser(deps, { role: 'admin', name: 'Właściciel' }); return deps.db; };
type Db = ReturnType<typeof fresh>;
const migrated = async (old: OldData = oldFixture()) => { const db = fresh(); const out = await migrate(db, old, { dryRun: false, now: NOW }); return { db, ...out }; };

const jobOf = (db: Db, nazwa: string, kategoria?: string) =>
  zlecenia.list(db).filter((j) => klienci.get(db, j.clientId)!.nazwa === nazwa && (!kategoria || j.kategoria === kategoria));
const cell = (db: Db, dzien: string, osoba: string) => {
  const p = uzytkownicy.listPeople(db).find((x) => x.nazwa === osoba)!;
  return harmonogram.range(db, dzien, dzien, false).days[0]!.entries.filter((e) => e.personId === p.id).sort((a, b) => a.slot - b.slot);
};
const label = (db: Db, e: { jobId: string | null }) => klienci.get(db, zlecenia.get(db, e.jobId!)!.clientId)!.nazwa;
const show = (db: Db, dzien: string, osoba: string) => cell(db, dzien, osoba).map((x) => [x.rodzaj, x.polDnia, x.jobId ? label(db, x) : x.kod ?? x.tekst]);
const n = (db: Db, t: any) => db.select({ n: count() }).from(t).get()!.n;

describe('readOld', () => {
  it('odczyt pliku atrapy daje to samo co oldFixture()', async () => {
    expect(await readOld(await fixtureXlsx())).toEqual(oldFixture());
  });
});

describe('transform', () => {
  it('kontakt z jednej komórki (także dwa numery bez separatora), termin, czas zapisu, hasło jako całe słowo', () => {
    expect(kontakt('tel. 600 111 222; p.zielinski@example.com')).toEqual({ telefony: ['600 111 222'], emaile: ['p.zielinski@example.com'], reszta: '' });
    expect(kontakt('+48727728903 wieczorem')).toEqual({ telefony: ['+48727728903'], emaile: [], reszta: 'wieczorem' });
    expect(kontakt('600 100 200 601 200 300').telefony).toEqual(['600 100 200', '601 200 300']);
    expect(kontakt('600100200, 601200300').telefony).toEqual(['600100200', '601200300']);
    expect([termin('październik 2026'), termin('Styczeń 2027'), termin('kiedyś'), termin(''), termin('wkrótce')]).toEqual(['2026-10', '2027-01', null, null, undefined]);
    expect([warsawIso('10.10.2026 14:20 · ✓ w Wycenach'), warsawIso('05.01.2026 08:00'), warsawIso('bez daty')]).toEqual(['2026-10-10T12:20:00.000Z', '2026-01-05T07:00:00.000Z', null]);
    expect([wordHit('lis', 'lis'), wordHit('u lis / nowak', 'lis'), wordHit('kalisz', 'lis'), wordHit('nowakowski', 'nowak'), wordHit('zawoja klima', 'zawoja klima')]).toEqual([true, true, false, false, true]);
  });

  it('dopisuje do słowników brakujące wartości arkusza z grupą sekcji, „Planowane” = „Zaplanowane”', () => {
    const plan = transform(oldFixture(), slowniki.listAll(fresh()));
    const add = (r: string) => plan.slowniki.filter((s) => s.rodzaj === r).map((s) => [s.wartosc, s.grupa ?? s.platne ?? null]);
    expect(add('status_zlecenia')).toEqual([['Do rozliczenia', 'zamkniete']]);
    expect(add('status_leada')).toEqual([['Do wyceny', 'aktualne']]);
    expect(add('kod_nieobecnosci')).toEqual([['bezpłatny', false], ['okolicznościowy', true]]);
    expect(add('kategoria')).toEqual([]); // nazwy z zadania 19i są w słowniku
    expect(plan.zlecenia.some((z) => z.status === 'Zaplanowane')).toBe(true);
  });

  it('kod ze słownika aplikacji tylko jako cała komórka, kody arkusza po początku tekstu', () => {
    const old = oldFixture();
    old.harmonogram.days[0]!.komorki.F = 'szkolenie BHP'; // „szkolenie” jest tylko w słowniku aplikacji
    old.harmonogram.days[0]!.komorki.G = 'urlop do piątku';
    const plan = transform(old, slowniki.listAll(fresh()));
    const day = plan.harmonogram.filter((h) => h.dzien === '2026-10-05');
    expect(day[1]!.sloty).toEqual([{ rodzaj: 'tekst', tekst: 'szkolenie BHP', polDnia: false }]);
    expect(day[2]!.sloty).toEqual([{ rodzaj: 'kod', kod: 'urlop', polDnia: false }]);
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

  it('ten sam telefon w leadzie i lead przyjęty jako zlecenie → ten sam klient; telefon i e-mail różnych klientów → do przejrzenia', async () => {
    const { db, report } = await migrated();
    const byTemat = (t: string) => leady.list(db).find((l) => l.temat === t)!;
    expect(byTemat('Jordanów / instalacja w garażu').clientId).toBe(jobOf(db, 'Piotr Zieliński', 'Smart home')[0]!.clientId);
    expect(db.select().from(clients).all().filter((c) => c.nazwa.includes('Zieliński'))).toHaveLength(2); // drugi bez telefonu – osobny
    const lis = byTemat('Skawica / klima 2 split');
    const job = jobOf(db, 'Tomasz Lis')[0]!;
    expect([lis.clientId, lis.siteId, job.leadId]).toEqual([job.clientId, job.siteId, lis.id]);
    expect(byTemat('Garaż – gniazdka').clientId).toBe(jobOf(db, 'Jan Kowalski')[0]!.clientId);
    expect(report.doPrzejrzenia.filter((r) => r.opis.startsWith('Kontakt wskazuje różnych klientów'))).toHaveLength(1);
  });

  it('„Kowalski / Nowak” → dwa sloty po pół dnia z właściwymi zleceniami; kody po początku tekstu', async () => {
    const { db } = await migrated();
    expect(show(db, '2026-10-07', 'Adam')).toEqual([['zlecenie', true, 'Jan Kowalski'], ['zlecenie', true, 'Nowak']]);
    expect(show(db, '2026-10-09', 'Darek')).toEqual([['zlecenie', true, 'Józef Dudek'], ['zlecenie', true, 'Marek Wójcik']]);
    expect(label(db, cell(db, '2026-10-05', 'Adam')[0]!)).toBe('Jan Kowalski');
    expect(zlecenia.get(db, cell(db, '2026-10-05', 'Czarek')[0]!.jobId!)!.kategoria).toBe('Klimatyzacja'); // „Zawoja klima”, nie „Kowalski”
    const kod = (d: string, o: string) => cell(db, d, o).map((x) => x.kod);
    expect([kod('2026-10-08', 'Adam'), kod('2026-10-09', 'Adam'), kod('2026-10-07', 'Bartek'), kod('2026-10-07', 'Czarek'), kod('2026-10-07', 'Darek')])
      .toEqual([['urlop'], ['UŻ'], ['szkolenie'], ['bezpłatny'], ['okolicznościowy']]);
    expect(harmonogram.drafts(db)).toEqual([]);
    expect(harmonogram.range(db, '2026-10-05', '2026-10-05', false).days[0]!.note).toBe('Adam: Zawoja 2 dni');
  });

  it('literówka, >2 wpisy, „A / B” bez hasła, hasło wewnątrz słowa → tekst z całej komórki + osobna pozycja na komórkę', async () => {
    const { db, report } = await migrated();
    expect(show(db, '2026-10-08', 'Bartek')).toEqual([['tekst', false, 'Nowk']]);
    expect(show(db, '2026-10-12', 'Adam')).toEqual([['tekst', false, 'Kowalski / Nowak / Lis']]);
    expect(show(db, '2026-10-12', 'Bartek')).toEqual([['tekst', false, 'magazyn / biuro']]);
    expect(show(db, '2026-10-12', 'Czarek')).toEqual([['tekst', false, 'Kalisz']]); // nie „Lis”
    const of = (dzien: string, osoba: string) => report.doPrzejrzenia.filter((r) => r.co === 'harmonogram' && r.dzien === dzien && r.osoba === osoba);
    expect(of('2026-10-08', 'Bartek').map((r) => [r.tekst, r.opis, r.pominiete])).toEqual([['Nowk', 'Wpis nie pasuje do hasła żadnego zlecenia ani do kodu – zapisano jako tekst', false]]);
    expect(of('2026-10-12', 'Adam')[0]!.opis).toBe('Więcej niż dwa wpisy w jednym dniu (3) – zapisano jako tekst');
    expect(of('2026-10-12', 'Czarek')[0]!.opis).toBe('Hasło „Lis” jest tylko fragmentem słowa we wpisie – nie przypisano – zapisano jako tekst');
    expect(report.doPrzejrzenia.filter((r) => r.tekst === 'magazyn').map((r) => r.dzien)).toEqual(['2026-10-06', '2026-10-08']); // jedna pozycja na komórkę
  });

  it('kilka pasujących haseł: najdłuższe, z pozycją do przejrzenia', async () => {
    const { db, report } = await migrated();
    expect(show(db, '2026-10-12', 'Darek')).toEqual([['zlecenie', false, 'Jan Kowalski']]);
    const r = report.doPrzejrzenia.find((x) => x.dzien === '2026-10-12' && x.osoba === 'Darek')!;
    expect(r.opis).toBe('Wpis pasuje do 2 zleceń (hasła: „Kowalski”, „Nowak”) – przypisano zlecenie z hasłem „Kowalski”');
  });

  it('osoby spoza płac pominięte, konta pracowników z ekipą, autor = administrator bazy', async () => {
    const { db } = await migrated();
    expect(uzytkownicy.listPeople(db).map((p) => p.nazwa)).toEqual(['Adam', 'Bartek', 'Czarek', 'Darek']);
    const admin = db.select().from(users).all().find((u) => u.role === 'admin')!;
    expect(db.select().from(users).all().filter((u) => u.role === 'pracownik').map((u) => [u.login, u.ekipa, u.createdBy])).toEqual([
      ['adam', 'ekipa Adam', admin.id], ['bartek', 'ekipa Bartek', admin.id], ['czarek', null, admin.id], ['darek', null, admin.id]]);
    expect(zlecenia.list(db).every((j) => j.createdBy === admin.id)).toBe(true);
  });

  it('decyzje właściciela: kategorie z kodów, H → Inne, „Do rozliczenia” zamknięte, rodzaj pusty, numery w kolejności daty', async () => {
    const { db } = await migrated();
    const js = zlecenia.list(db);
    expect(jobOf(db, 'Anna Wiśniewska')[0]!.kategoria).toBe('Inne');
    expect(jobOf(db, 'Nowak')[0]!.kategoria).toBe('Rekuperacja');
    const dudek = jobOf(db, 'Józef Dudek')[0]!;
    expect([dudek.status, slowniki.groupOf(db, 'status_zlecenia', dudek.status), dudek.zamknieteAt]).toEqual(['Do rozliczenia', 'zamkniete', '2026-10-20T12:00:00.000Z']);
    expect(js.every((j) => j.rodzaj === '')).toBe(true);
    // „Od” z arkusza, inaczej pierwszy dzień po przeniesieniu, inaczej miesiąc terminu; bez daty na końcu
    const byNum = [...js].sort((a, b) => a.numer.localeCompare(b.numer)).map((j) => klienci.get(db, j.clientId)!.nazwa);
    expect(byNum.slice(0, 3)).toEqual(['Ewa Kamińska', 'Jan Kowalski', 'Nowak']);
    // Wiśniewska nie ma przypisanych komórek („Wiśniewska?”), ale „Od” z arkusza = 6.10 → przed Lisem (8.10)
    expect(byNum.indexOf('Anna Wiśniewska')).toBeLessThan(byNum.indexOf('Tomasz Lis'));
    expect(byNum.at(-1)).toBe('Piotr Zieliński');
  });

  it('dni w harmonogramie z arkusza a po przeniesieniu: różnice do przejrzenia', async () => {
    const { report } = await migrated();
    const dni = report.doPrzejrzenia.filter((r) => r.opis.startsWith('Dni w harmonogramie')).map((r) => [r.tekst, r.opis.split(' – ')[0]]);
    expect(dni).toEqual([
      ['Kowalski', 'Dni w harmonogramie: w arkuszu 6, po przeniesieniu 5 (w tym 1 u osób spoza listy płac)'],
      ['Wiśniewska', 'Dni w harmonogramie: w arkuszu 1, po przeniesieniu 0'],
      ['Lis', 'Dni w harmonogramie: w arkuszu 3, po przeniesieniu 1'],
    ]);
  });

  it('zadania bez grup form i fi, zakupy: „Zamówione” → Do kupienia, reszta pól w uwagach, kupione bez daty do przejrzenia', async () => {
    const { db, report } = await migrated();
    const ts = zadania.list(db);
    expect(ts.map((t) => t.tekst).sort()).toEqual(['Instrukcja centrali', 'Kupić nową drukarkę', 'Odnowić ubezpieczenie OC', 'Przegląd samochodów', 'Uzupełnić wycenę dla Mazura', 'Zadzwonić do hurtowni w sprawie rabatu']);
    expect(ts.find((t) => t.tekst === 'Przegląd samochodów')!.cykliczne).toBe(true);
    const zs = zakupy.list(db);
    expect(zs.find((z) => z.co === 'Pompa skroplin')).toMatchObject({ status: 'Do kupienia', uwagi: 'dostawa w piątek; Sklep: Allegro; Grupa: Osprzęt klima; Kwota: 249,99 zł; Zamówione' });
    expect(zs.find((z) => z.co === 'Klucz dynamometryczny')).toMatchObject({ status: 'Kupione', kupioneAt: '2026-09-15T12:00:00.000Z' });
    expect(report.doPrzejrzenia.filter((r) => r.co === 'zakupy').map((r) => r.opis)).toEqual(['Kupione bez daty zakupu – data zakupu = chwila przeniesienia']);
  });

  it('kontakty z historii przy leadzie ze statusem, planem i chwilą zapisu z arkusza; wpis testowy pominięty', async () => {
    const { db } = await migrated();
    const mazur = leady.list(db).find((l) => l.temat === 'Sucha – klimatyzacja biura')!;
    expect(leady.contactsOf(db, mazur.id).map((c) => [c.dzien, c.notatka, c.status, c.plan, c.createdAt]))
      .toEqual([['2026-10-10', 'prosi o wycenę dwóch jednostek', 'Do wyceny', '2026-10-09', '2026-10-10T12:20:00.000Z']]);
    expect([mazur.ostatni, mazur.nastepny]).toEqual(['2026-10-10', '2026-11-05']);
    expect(leady.list(db).find((l) => l.temat === 'Rekuperacja w nowym domu')!.uwagi).toBe('Ostatni kontakt 02.09.2026: zadzwoni po zimie');
  });

  it('raport: każda liczba w źródle = w bazie, poza pominiętymi; lista „do przejrzenia” zapisana w bazie', async () => {
    const { db, report } = await migrated();
    expect(report.wiersze.filter((w) => w.roznica !== null && w.roznica !== 0)).toEqual([]);
    const w = Object.fromEntries(report.wiersze.map((x) => [x.co, [x.zrodlo, x.baza, x.pominiete, x.roznica]]));
    expect(w['Zadania i notatki']).toEqual([8, 6, 2, 0]);
    expect(w['Harmonogram – komórki osób']).toEqual([26, 24, 2, 0]);
    expect(w['Harmonogram – wpisy: zlecenie']![0]).toBeGreaterThan(0);
    expect(w['Osoby w harmonogramie']).toEqual([6, 4, 2, 0]);
    expect(w['Kontakty z leadami']).toEqual([2, 1, 1, 0]);
    expect(w['Dni w harmonogramie (kolumna arkusza, informacyjnie)']).toEqual([11, 7, 0, null]);
    expect(w['Klienci (po połączeniu, informacyjnie)']![3]).toBeNull();
    const stored = przeniesienie.list(db);
    expect(stored).toHaveLength(report.doPrzejrzenia.length);
    expect(stored.every((r) => !r.przejrzane)).toBe(true);
    expect(stored.find((r) => r.tekst === 'Nowk')).toMatchObject({ dzien: '2026-10-08', osoba: 'Bartek', arkusz: 'Harmonogram' });
    expect(reviewCsv(report.doPrzejrzenia).split('\r\n')[0]).toBe('﻿Arkusz;Wiersz;Dzień;Osoba;Tekst;Dotyczy;Przeniesiono;Opis');
  });

  it('--dry-run nic nie zapisuje, a raport i loginy są te same; druga próba na zapełnionej bazie odmawia', async () => {
    const db = fresh();
    const counts = () => [clients, users, changes].map((t) => n(db, t));
    const before = counts();
    const dry = await migrate(db, oldFixture(), { dryRun: true, now: NOW });
    expect(counts()).toEqual(before);
    expect(dry.konta.every((k) => k.haslo === '')).toBe(true);
    const real = await migrate(db, oldFixture(), { dryRun: false, now: NOW });
    expect(real.report).toEqual(dry.report);
    expect(real.konta.map((k) => k.login)).toEqual(['adam', 'bartek', 'czarek', 'darek']);
    expect(dry.konta.map((k) => k.login)).toEqual(real.konta.map((k) => k.login));
    expect(real.konta.every((k) => k.haslo.length >= 8)).toBe(true);
    await expect(migrate(db, oldFixture(), { dryRun: true, now: NOW })).rejects.toThrow(/Baza nie jest pusta/);
  });

  it('bez administratora: zapis odmawia, próba działa na tymczasowym koncie i nic nie zostawia', async () => {
    const db = fresh(false);
    const before = [users, clients, changes].map((t) => n(db, t));
    await expect(migrate(db, oldFixture(), { dryRun: false, now: NOW })).rejects.toThrow(/nie ma administratora/);
    const dry = await migrate(db, oldFixture(), { dryRun: true, now: NOW });
    expect(dry.report.wiersze.find((w) => w.co === 'Zlecenia')!.baza).toBe(11);
    expect([users, clients, changes].map((t) => n(db, t))).toEqual(before);
  });

  it('błąd w połowie zapisu wycofuje wszystko', async () => {
    const db = fresh();
    const before = [clients, users, changes].map((t) => n(db, t));
    const plan = transform(oldFixture(), slowniki.listAll(db));
    plan.harmonogram.push({ dzien: '2026-10-20', osoba: 99, sloty: [{ rodzaj: 'kod', kod: 'urlop', polDnia: false }] }); // osoby nie ma
    expect(() => tx(db, () => apply(db, plan, { hashes: plan.osoby.map(() => 'x'), now: NOW }))).toThrow();
    expect([clients, users, changes].map((t) => n(db, t))).toEqual(before);
  });
});
