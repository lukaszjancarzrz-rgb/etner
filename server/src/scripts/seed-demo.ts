import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { addDays, dayOf, isWorkday, mondayOf, newId, type ScheduleProposal } from '@etner/shared';
import { hashPassword } from '../core/password.js';
import { tx, type Db } from '../core/db.js';
import { makeVariants, type FileStore } from '../core/files.js';
import { users } from '../core/schema-base.js';
import { attachments } from '../modules/dziennik/schema.js';
import * as dziennik from '../modules/dziennik/service.js';
import * as harmonogram from '../modules/harmonogram/service.js';
import * as klienci from '../modules/klienci/service.js';
import * as leady from '../modules/leady/service.js';
import * as naJutro from '../modules/na-jutro/service.js';
import * as uzytkownicy from '../modules/uzytkownicy/service.js';
import * as zadania from '../modules/zadania/service.js';
import * as zakupy from '../modules/zakupy/service.js';
import * as zakres from '../modules/zlecenia/scope.js';
import * as zlecenia from '../modules/zlecenia/service.js';

const BARTEK = 'ekipa Bartek', MAREK = 'ekipa Marek';
/** Wymyślone osoby; kolejność = kolejność kolumn w harmonogramie. Admini nie mają kolumn. */
const DEMO_USERS = [
  { login: 'bartek', name: 'Bartek Gawlik', role: 'pracownik', ekipa: BARTEK },
  { login: 'piotr', name: 'Piotr Kuchta', role: 'pracownik', ekipa: BARTEK },
  { login: 'kamil', name: 'Kamil Zięba', role: 'pracownik', ekipa: BARTEK },
  { login: 'marek', name: 'Marek Pilch', role: 'pracownik', ekipa: MAREK },
  { login: 'adam', name: 'Adam Pająk', role: 'pracownik', ekipa: MAREK },
  { login: 'tomek', name: 'Tomasz Wrona', role: 'admin', ekipa: null },
  { login: 'anna', name: 'Anna Syrek', role: 'admin', ekipa: null },
] as const;

/** Jedno hasło wszystkich kont demo (dane wymyślone, wersja testowa). */
export const DEMO_PASSWORD = 'demo1234';

export type DemoAccount = { name: string; role: string; ekipa: string | null; login: string; haslo: string };
export function demoAccounts(db: Db): DemoAccount[] {
  const byName = new Map(uzytkownicy.list(db).map((u) => [u.name, u]));
  return [...DEMO_USERS].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin')).filter((d) => byName.has(d.name))
    .map(({ name, role, ekipa, login }) => ({ name, role, ekipa, login, haslo: DEMO_PASSWORD }));
}

const CLIENTS = [
  ['Józef Bukowski', 'Zawoja', 'Zawoja 1420'], ['Maria Cholewa', 'Sucha Beskidzka', 'ul. Kościuszki 12'],
  ['Pensjonat Pod Babią Górą', 'Zawoja', 'Zawoja Markowa 88'], ['Stanisław Mrówka', 'Stryszawa', 'Stryszawa 540'],
  ['Janina Targosz', 'Jordanów', 'ul. Rynek 7'], ['Dom Zdrowia Sp. z o.o.', 'Maków Podhalański', 'ul. Zawoja 3'],
  ['Wojciech Kolasa', 'Budzów', 'Budzów 215'], ['Ewa Jarosz', 'Skawica', 'Skawica 300'],
  ['Krzysztof Łasak', 'Białka', 'Białka 77'], ['Hotel Orawa', 'Juszczyn', 'Juszczyn 132'],
  ['Helena Szlachta', 'Zembrzyce', 'Zembrzyce 410'], ['Paweł Biel', 'Maków Podhalański', 'ul. Słoneczna 5'],
] as const;

// [klient, status, ekipa, rodzaj, kategoria, termin(+mies.), zakres]
const JOBS: [number, string, string | null, string, string, number, string][] = [
  [0, 'W realizacji', BARTEK, 'montaż', 'Rekuperacja', 0, 'Montaż rekuperatora w domu jednorodzinnym, kanały na poddaszu.'],
  [2, 'W realizacji', MAREK, 'montaż', 'Klimatyzacja', 0, 'Trzy jednostki split w pokojach gościnnych.'],
  [3, 'Zaplanowane', BARTEK, 'montaż', 'Pompa ciepła', 1, 'Pompa powietrze-woda 8 kW, podłączenie do CO.'],
  [5, 'Zaplanowane', MAREK, 'montaż', 'Rekuperacja', 0, 'Centrala na strychu, wentylacja gabinetów.'],
  [9, 'Zaplanowane', MAREK, 'montaż', 'Klimatyzacja', 1, 'Klimatyzacja sali konferencyjnej.'],
  [1, 'Do dokończenia', BARTEK, 'montaż', 'Rekuperacja', 0, 'Brakuje regulacji przepływów i protokołu.'],
  [4, 'Nowe', null, 'montaż', 'Klimatyzacja', 2, 'Klient prosi o wizję lokalną.'],
  [6, 'Nowe', null, 'serwis', 'Serwis', 1, 'Przegląd roczny klimatyzacji.'],
  [7, 'Do wyceny', null, 'montaż', 'Pompa ciepła', 2, 'Dom 140 m2, stare ogrzewanie gazowe.'],
  [8, 'W realizacji', BARTEK, 'gwarancja', 'Serwis', 0, 'Hałas jednostki zewnętrznej, reklamacja.'],
  [10, 'Na później', null, 'montaż', 'Rekuperacja', 4, 'Inwestycja po sezonie, klient wróci jesienią.'],
  [11, 'Zakończone', MAREK, 'montaż', 'Klimatyzacja', -1, 'Zamontowano dwie jednostki, odbiór bez uwag.'],
  [0, 'Rozliczone', BARTEK, 'serwis', 'Serwis', -2, 'Wymiana filtrów i czyszczenie wymiennika.'],
  [3, 'Anulowane', null, 'montaż', 'Inne', -1, 'Klient zrezygnował.'],
];

const LEADS: [number | null, string, string, string, string, number | null, string][] = [
  [4, 'Nowy', 'Rekuperacja w nowym domu', 'Polecenie', 'Rekuperacja', -2, 'Stan surowy zamknięty, chce wycenę.'],
  [8, 'W kontakcie', 'Pompa ciepła zamiast pieca gazowego', 'Strona www', 'Pompa ciepła', 0, 'Zapytanie z formularza.'],
  [6, 'Wycena wysłana', 'Klimatyzacja w pensjonacie', 'Telefon', 'Klimatyzacja', 5, 'Wycena wysłana e-mailem.'],
  [10, 'Przyjęta', 'Rekuperacja z odzyskiem', 'Polecenie', 'Rekuperacja', null, 'Przyjęta, czeka na termin.'],
  [7, 'Odrzucona', 'Klimatyzacja w sypialni', 'Facebook', 'Klimatyzacja', null, 'Wybrał tańszą ofertę.'],
  [11, 'Na kiedyś', 'Pompa ciepła do garażu', 'Inne', 'Pompa ciepła', 60, 'Wróci do tematu na wiosnę.'],
];

export interface DemoOpts { now?: Date; photo?: { w: number; h: number } }

const CAPTIONS = ['Centrala rekuperacji', 'Kanały na poddaszu', 'Jednostka zewnętrzna', 'Skrzynka rozdzielcza', 'Przejście przez ścianę',
  'Skraplacz po montażu', 'Pompa ciepła', 'Zawór i zasilanie', 'Pokój gościnny', 'Odbiór instalacji'];
const HUES = [[20, 40], [200, 230], [150, 180], [260, 300], [10, 330], [100, 130], [190, 160], [40, 20], [220, 190], [170, 140]];

async function photo(i: number, w: number, h: number): Promise<Buffer> {
  const [a, b] = HUES[i % HUES.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${a},55%,45%)"/><stop offset="1" stop-color="hsl(${b},60%,25%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(h / 12)}" fill="#fff">${CAPTIONS[i % CAPTIONS.length]} ${i + 1}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

/** Zakłada dane demo tylko w bazie bez użytkowników (po migrate + seedBase). Zwraca false, gdy nic nie dodano. */
export async function seedDemo(db: Db, files: FileStore, opts: DemoOpts = {}): Promise<boolean> {
  if (db.select({ id: users.id }).from(users).limit(1).get()) return false;
  const now = opts.now ?? new Date();
  const today = dayOf(now);
  const { w, h } = opts.photo ?? { w: 1600, h: 1200 };

  const passwordHash = await hashPassword(DEMO_PASSWORD); // jeden skrót dla wszystkich kont demo

  // Pliki najpierw (async), potem jedna transakcja na wszystkie zapisy.
  const ph = await Promise.all(Array.from({ length: 12 }, async (_, i) => { // 10 do dziennika, 2 do zakresu prac
    const id = newId();
    const buf = await photo(i, w, h);
    const v = await makeVariants(buf);
    const k = `att/${id}`;
    await Promise.all([files.put(`${k}/view.webp`, v.view, 'image/webp'), files.put(`${k}/thumb.webp`, v.thumb, 'image/webp'), files.put(`${k}/orig.jpg`, buf, 'image/jpeg')]);
    return { id, k, buf, v, i };
  }));

  tx(db, () => {
    // Użytkownicy ze wspólnym hasłem demo.
    const u: Record<string, ReturnType<typeof uzytkownicy.create>> = {};
    let by = 'demo';
    for (const d of [...DEMO_USERS].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin'))) {
      const user = uzytkownicy.create(db, by, { login: d.login, passwordHash, name: d.name, role: d.role, perms: [], ekipa: d.ekipa });
      u[d.login] = user;
      if (by === 'demo') by = user.id;
    }
    const a1 = u.tomek!.id, a2 = u.anna!.id;
    const people: Record<string, string> = {};
    for (const d of DEMO_USERS) if (d.role !== 'admin') people[d.login] = uzytkownicy.createPerson(db, a1, { nazwa: d.name, userId: u[d.login]!.id }).id;

    // Klienci z obiektami.
    const cl = CLIENTS.map(([nazwa, miejscowosc, adres], i) => {
      const r = klienci.create(db, a1, {
        typ: /Hotel|Pensjonat|Sp\./.test(nazwa) ? 'firma' : 'osoba', nazwa, telefony: [`600 100 ${String(100 + i)}`], emaile: [],
        nip: '', notatki: '', site: { nazwa: '', adres, miejscowosc, mapa: '', opis: '' },
      });
      return { id: r.client.id, siteId: r.site!.id };
    });

    // Leady.
    LEADS.forEach(([ci, status, temat, zrodlo, kategoria, nastepny, opis]) => {
      const c = ci === null ? undefined : cl[ci];
      leady.save(db, a1, { clientId: c?.id, siteId: c?.siteId, status, temat, zrodlo, kategoria, opis, nastepny: nastepny === null ? '' : addDays(today, nastepny), wartoscGr: 1_200_000 } as never);
    });

    // Zlecenia.
    const month = (off: number) => addDays(`${today.slice(0, 7)}-15`, off * 30).slice(0, 7);
    const jobs = JOBS.map(([ci, status, ekipa, rodzaj, kategoria, off, zakres]) =>
      zlecenia.save(db, a1, { clientId: cl[ci]!.id, siteId: cl[ci]!.siteId, status, ekipa, rodzaj, kategoria, termin: month(off), uwagiAdmin: 'Uwaga wewnętrzna (demo).' } as never)!);

    // Harmonogram: bieżący tydzień + 3 kolejne, zatwierdzony; potem dwa szkice.
    const crewJobs = (ekipa: string) => jobs.filter((j) => j.ekipa === ekipa && ['W realizacji', 'Zaplanowane', 'Do dokończenia'].includes(j.status));
    const first = mondayOf(today);
    const cell = (login: string, k: number, i: number, wk: number, dow: number): ScheduleProposal => {
      const d = DEMO_USERS.find((x) => x.login === login)!;
      if (login === 'kamil' && wk === 1 && dow < 2) return [{ rodzaj: 'kod', kod: 'urlop', polDnia: false }];
      if (login === 'adam' && wk === 2 && dow === 4) return [{ rodzaj: 'kod', kod: 'szkolenie', polDnia: false }];
      const js = crewJobs(d.ekipa!);
      if (!js.length) return [];
      if (login === 'piotr' && dow === 3) return [{ rodzaj: 'zlecenie', jobId: js[0]!.id, polDnia: true }, { rodzaj: 'zlecenie', jobId: js[(i + 1) % js.length]!.id, polDnia: true }];
      return [{ rodzaj: 'zlecenie', jobId: js[Math.floor((wk * 5 + dow + k) / 3) % js.length]!.id, polDnia: false }];
    };
    for (let i = 0; i < 28; i++) {
      const dzien = addDays(first, i);
      if (isWorkday(dzien, []) !== 1) continue;
      DEMO_USERS.forEach((d, k) => {
        if (!people[d.login]) return;
        const value = cell(d.login, k, i, Math.floor(i / 7), i % 7);
        if (Array.isArray(value) && value.length) harmonogram.setDraft(db, a1, { from: dzien, to: dzien, people: [people[d.login]!], value, workdaysOnly: false });
      });
    }
    harmonogram.approve(db, a1, undefined, now);
    let next = addDays(today, 1);
    while (isWorkday(next, []) !== 1) next = addDays(next, 1);
    harmonogram.setDraft(db, a2, { from: next, to: next, people: [people.bartek!], value: [{ rodzaj: 'kod', kod: 'urlop', polDnia: false }], workdaysOnly: false });
    harmonogram.setDraft(db, a2, { from: next, to: next, people: ['uwagi'], value: { tekst: 'Przegląd samochodów dostawczych' }, workdaysOnly: false });

    // Zakres prac: tekst z listy jako pierwszy punkt; pierwsze zlecenie ma trzy punkty i zdjęcia.
    const t0 = now.toISOString();
    const scopePh = ph.slice(10).map((x) => {
      db.insert(attachments).values({
        id: x.id, rodzaj: 'zdjecie', keyOrig: `${x.k}/orig.jpg`, keyView: `${x.k}/view.webp`, keyThumb: `${x.k}/thumb.webp`,
        nazwa: `zakres-${x.i - 9}.jpg`, mime: 'image/jpeg', bajty: x.buf.length, w: x.v.w, h: x.v.h, authorId: a1, createdAt: t0, createdBy: a1, updatedAt: t0,
      }).run();
      return x.id;
    });
    JOBS.forEach(([, , , , , , tekst], i) => zakres.create(db, a1, jobs[i]!.id, { tekst, uploads: i === 0 ? scopePh : [] }));
    zakres.create(db, a1, jobs[0]!.id, { tekst: 'Anemostaty w sypialniach i łazience, kratki w kuchni.', uploads: [] });
    zakres.create(db, a1, jobs[0]!.id, { tekst: 'Regulacja przepływów i protokół dla klienta.', uploads: [] });

    // Dzienniki ze zdjęciami (10): wpisy zlecenia przez serwis dziennika.
    const now0 = now.toISOString();
    const entries: [number, string, string, number][] = [
      [0, 'bartek', 'Rozpoczęty montaż centrali, kanały główne gotowe.', 3], [0, 'piotr', 'Przejścia przez ściany zakończone.', 2],
      [1, 'marek', 'Jednostki wewnętrzne powieszone.', 2], [9, 'bartek', 'Sprawdzony stan jednostki, dokręcone mocowania.', 2],
      [5, 'kamil', 'Brakujące regulacje do dokończenia.', 1], [2, 'bartek', 'Wizja lokalna przed montażem pompy, miejsce na zewnątrz wybrane.', 0],
      [3, 'marek', 'Klient poprosił o termin po godz. 10.', 0],
    ];
    let p = 0;
    for (const [ji, login, tekst, nPhotos] of entries) {
      const me = u[login]!;
      const ids = ph.slice(p, p + nPhotos).map((x) => {
        db.insert(attachments).values({
          id: x.id, rodzaj: 'zdjecie', keyOrig: `${x.k}/orig.jpg`, keyView: `${x.k}/view.webp`, keyThumb: `${x.k}/thumb.webp`,
          nazwa: `zdjecie-${x.i + 1}.jpg`, mime: 'image/jpeg', bajty: x.buf.length, w: x.v.w, h: x.v.h, authorId: me.id, createdAt: now0, createdBy: me.id, updatedAt: now0,
        }).run();
        return x.id;
      });
      p += nPhotos;
      dziennik.create(db, me, { owner_type: 'job', owner_id: jobs[ji]!.id, tekst, uploads: ids }, () => [], []);
    }
    const lead = leady.list(db)[0]!;
    dziennik.create(db, u.tomek!, { owner_type: 'lead', owner_id: lead.id, tekst: 'Zadzwonić we wtorek, klient chce wycenę z montażem.', uploads: [] }, () => [], []);

    // Zakupy.
    const buy = (co: string, uwagi = '', status?: string) => {
      const r = zakupy.create(db, u.bartek!.id, { co, uwagi });
      if (status) zakupy.update(db, a1, r.id, { status });
    };
    buy('Kolanka 160 mm, 10 szt.', 'Hurtownia Wentylacja');
    buy('Taśma aluminiowa 50 m');
    buy('Wkrętarka akumulatorowa');
    buy('Filtry G4 do centrali', 'do centrali w Zawoi');
    buy('Rolka papieru do plotera', '', 'Kupione');

    // Listy „na jutro”.
    const tomorrow = addDays(today, 1);
    for (const [ekipa, who, items] of [
      [BARTEK, u.bartek!, ['Centrala rekuperacji', 'Kanały 160 mm', 'Taśma aluminiowa', 'Wkrętarka i wiertła']],
      [MAREK, u.marek!, ['Jednostki wewnętrzne x3', 'Rury miedziane', 'Pompa skroplin', 'Drabina']],
    ] as const) {
      items.forEach((tekst, i) => {
        const dzien = i < 2 ? today : tomorrow;
        const r = naJutro.create(db, who.id, { ekipa, dzien, tekst });
        if (i === 0 && dzien === today) naJutro.setZabrane(db, who.id, r.id, true);
      });
    }

    // Zadania (jedno cykliczne).
    const task = (tekst: string, priorytet: number | null, grupa: string, termin: string | null, status?: string, cykliczne = false) =>
      zadania.save(db, a1, { tekst, priorytet, grupa, termin, status, cykliczne, uwagi: '' }, today);
    task('Zadzwonić do klienta w sprawie terminu', 1, 'Klienci', today);
    task('Zamówić filtry do przeglądów', 2, 'Sprzęt', addDays(today, 3), 'W toku');
    task('Przegląd samochodów dostawczych', 3, 'Firma', addDays(today, 7));
    task('Przeliczyć wycenę pompy ciepła', 2, 'Klienci', addDays(today, 2));
    task('Kalibracja manometrów', 4, 'Sprzęt', addDays(today, 30), undefined, true);
    task('Uzupełnić kartę gwarancyjną', null, 'Firma', null, 'Zrobione');
  });
  return true;
}
