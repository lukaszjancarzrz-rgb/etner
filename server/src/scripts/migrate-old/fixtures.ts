import ExcelJS from 'exceljs';
import { addDays } from '@etner/shared';
import { COLS, HEADER_ROW, SHEETS, sectionName, type Cols } from './layout.js';
import { oldDataSchema, type OldBuy, type OldContact, type OldData, type OldJob, type OldLead, type OldTask } from './old-data.js';

/*
 * Atrapa arkusza Firma_2026: wymyślone dane w układzie kart modułu 1 (znaczniki sekcji w kolumnie A, archiwum po prawej,
 * nagłówki w tych samych wierszach, harmonogram osoby × dni jako wolny tekst). Plik powstaje w teście, nie leży w repozytorium.
 */

type Row<T> = Omit<T, 'wiersz' | 'sekcja'>;
type Sec<T> = { marker: string; title: string; row: number; end: number; rows: Row<T>[] };
type Table<T> = { col: number; headers: string[]; secs: Sec<T>[]; extra?: Record<string, string | boolean> };

const j = (o: Partial<Row<OldJob>>): Row<OldJob> => ({
  kat: '', status: '', termin: '', ekipa: '', lokalizacja: '', klient: '', zakres: '', kontakt: '', uwagi: '', haslo: '', zamknieto: null, dni: null, od: null, ...o,
});
const l = (o: Partial<Row<OldLead>>): Row<OldLead> => ({
  dodano: null, kat: '', status: '', temat: '', klient: '', kontakt: '', zrodlo: '', opis: '', wartosc: null, nastepny: null, ustalono: '', ostatni: null, uwagi: '', zamknieto: null, ...o,
});
const t = (o: Partial<Row<OldTask>>): Row<OldTask> => ({ tekst: '', priorytet: null, grupa: '', status: '', termin: null, uwagi: '', zrobiono: null, ...o });
const b = (o: Partial<Row<OldBuy>>): Row<OldBuy> => ({ co: '', sklep: '', grupa: '', status: '', kwota: null, lista: '', uwagi: '', kupiono: null, ...o });

const JOB_H = ['Lp.', 'Kat.', 'Status', 'Termin (miesiąc)', 'Ekipa', 'Lokalizacja', 'Inwestor / klient', 'Zakres prac', 'Kontakt (tel. / e-mail)', 'Uwagi', 'Hasło w harmonogramie', 'Dni w harmono-gramie', 'Od', 'Do'];
const LEAD_H = ['Lp.', 'Data dodania', 'Kat.', 'Status', 'Temat / lokalizacja', 'Klient', 'Kontakt (tel. / e-mail)', 'Skąd klient', 'Opis / info', 'Wartość wyceny netto (zł)', 'Następny kontakt', '✓ Kontakt odbyty', 'Co ustalono (przy kontakcie)', 'Ostatni kontakt', 'Uwagi'];
const TASK_H = ['Lp.', 'Zadanie / notatka', 'Priorytet', 'Grupa', 'Status', 'Termin', 'Uwagi / link'];
const BUY_H = ['Lp.', 'Co', 'Sklep', 'Grupa', 'Status', 'Kwota (zł)', 'Lista (z notatek)', 'Uwagi'];

/** Ten sam klient (Jan Kowalski) w dwóch zleceniach, telefon zapisany raz z odstępami, raz z +48. */
const ZLECENIA = {
  left: [
    { marker: '@AKTUALNE|s|Planowane;W realizacji', title: 'AKTUALNE – teraz i najbliższe tygodnie', row: 6, end: 53, rows: [
      j({ kat: 'E', status: 'W realizacji', termin: 'październik 2026', ekipa: 'ekipa Adam', lokalizacja: 'Zawoja', klient: 'Jan Kowalski', zakres: 'elektryka – dom, rozdzielnica', kontakt: '727 728 903', haslo: 'Kowalski', dni: 6, od: '2026-10-05' }),
      j({ kat: 'RW', status: 'W realizacji', termin: 'październik 2026', ekipa: 'ekipa Bartek', lokalizacja: 'Stryszawa', klient: 'Nowak', zakres: 'rekuperacja – kanały + centrala', uwagi: 'klucz u sąsiada', haslo: 'Nowak' }),
      j({ kat: 'K', status: 'Planowane', termin: 'listopad 2026', ekipa: 'ekipa Adam', lokalizacja: 'Zawoja', klient: 'Jan Kowalski', zakres: 'klima – 2 split', kontakt: '+48727728903', haslo: 'Zawoja klima' }),
      j({ kat: 'H', status: 'Planowane', termin: 'grudzień 2026', ekipa: 'mieszane', lokalizacja: 'Budzów', klient: 'Anna Wiśniewska', zakres: 'hydraulika – kotłownia', haslo: 'Wiśniewska', dni: 1, od: '2026-10-06' }),
      j({ kat: 'SH', status: 'Planowane', termin: 'kiedyś', ekipa: 'ekipa Bartek', lokalizacja: 'Jordanów', klient: 'Piotr Zieliński', zakres: 'smart home – sterowanie roletami', kontakt: 'tel. 600 111 222; p.zielinski@example.com', haslo: 'Zieliński' }),
      j({ kat: 'E', status: 'W realizacji', termin: 'październik 2026', ekipa: 'ekipa Bartek', lokalizacja: 'Maków Podhalański', klient: 'Marek Wójcik', zakres: 'elektryka – warsztat', haslo: 'Wójcik' }),
    ] },
    { marker: '@NA PÓŹNIEJ|s|Na później', title: 'NA PÓŹNIEJ – przesunięte w czasie / na kiedyś', row: 55, end: 77, rows: [
      j({ kat: 'AM', status: 'Na później', termin: 'kiedyś', lokalizacja: 'Maków Podhalański', klient: 'Piotr Zieliński', zakres: 'alarm + kamery w sklepie' }),
      j({ kat: 'S', status: 'Na później', termin: 'marzec 2027', lokalizacja: 'Sucha Beskidzka', klient: 'Hurtownia Beskid Sp. z o.o.', zakres: 'sprzedaż – rekuperatory' }),
    ] },
  ],
  archive: { marker: '@ZAKOŃCZONE|s|Do rozliczenia;Rozliczone;Anulowane', title: 'ZAKOŃCZONE – archiwum', row: 6, end: 158, rows: [
    j({ kat: 'K', status: 'Rozliczone', termin: 'wrzesień 2026', ekipa: 'ekipa Adam', lokalizacja: 'Skawica', klient: 'Tomasz Lis', zakres: 'klima – 2 split', haslo: 'Lis', zamknieto: '2026-09-30', dni: 3, od: '2026-10-08' }),
    j({ kat: 'E', status: 'Do rozliczenia', termin: 'październik 2026', ekipa: 'ekipa Bartek', lokalizacja: 'Białka', klient: 'Józef Dudek', zakres: 'elektryka – garaż', haslo: 'Dudek', zamknieto: '2026-10-20', dni: 1, od: '2026-10-09' }),
    j({ kat: 'I', status: 'Anulowane', termin: 'sierpień 2026', lokalizacja: 'Zembrzyce', klient: 'Ewa Kamińska', zakres: 'przegląd instalacji', zamknieto: '2026-08-12' }),
  ] },
};

/** Lead „Skawica / klima 2 split” (Lis, przyjęty) stał się zleceniem Tomasza Lisa; lead Zielińskiego ma ten sam telefon bez odstępów. */
const WYCENY = {
  left: [
    { marker: '@NA JUŻ|s|Do wyceny;Wycena wysłana', title: 'NA JUŻ – do wyceny i wysłane', row: 6, end: 38, rows: [
      l({ kat: 'K', status: 'Do wyceny', temat: 'Sucha – klimatyzacja biura', klient: 'Mazur', kontakt: '501 202 303 / mazur@example.com', zrodlo: 'polecenie', opis: 'biuro 3 pokoje', nastepny: '2026-11-05', ostatni: '2026-10-10' }),
      l({ kat: 'E', status: 'Wycena wysłana', temat: 'Jordanów / instalacja w garażu', klient: 'Zieliński', kontakt: '600111222', zrodlo: 'google', nastepny: '2026-10-30' }),
      // telefon Kowalskiego, e-mail Zielińskiego
      l({ kat: 'E', status: 'Do wyceny', temat: 'Garaż – gniazdka', klient: 'Kowalski', kontakt: '727728903; p.zielinski@example.com' }),
    ] },
    { marker: '@NA KIEDYŚ|s|Na później', title: 'NA KIEDYŚ – wrócić do tematu później', row: 40, end: 62, rows: [
      l({ kat: 'RW', status: 'Na później', temat: 'Rekuperacja w nowym domu', klient: 'Pająk', zrodlo: 'oferteo', opis: 'stan surowy, wiosna', nastepny: '2027-03-01', ustalono: 'zadzwoni po zimie', ostatni: '2026-09-02' }),
    ] },
  ],
  archive: { marker: '@ZAMKNIĘTE|s|Przyjęta;Odrzucona', title: 'ZAMKNIĘTE – archiwum', row: 6, end: 158, rows: [
    l({ kat: 'K', status: 'Przyjęta', temat: 'Skawica / klima 2 split', klient: 'Lis', zrodlo: 'znajomi', zamknieto: '2026-08-20' }),
    l({ kat: 'AM', status: 'Odrzucona', temat: 'Monitoring hali', klient: 'Krawczyk', wartosc: 8500, zamknieto: '2026-09-10' }),
  ] },
};

const HISTORIA: Row<OldContact>[] = [
  { dzien: '2026-10-10', temat: 'Sucha – klimatyzacja biura', klient: 'Mazur', kontakt: '501 202 303', plan: '2026-10-09', ustalono: 'prosi o wycenę dwóch jednostek', nastepny: '2026-11-05', status: 'Do wyceny', zapisano: '10.10.2026 14:20 · ✓ w Wycenach' },
  { dzien: '2026-10-12', temat: 'test', klient: 'test', kontakt: '', plan: null, ustalono: 'test', nastepny: null, status: 'Do wyceny', zapisano: '12.10.2026 09:00 · ✓ w Wycenach' },
];

const ZADANIA = {
  left: [
    { marker: '@BIEŻĄCE|g|Bieżące', title: 'BIEŻĄCE – do zrobienia teraz', row: 6, end: 28, rows: [
      t({ tekst: 'Zadzwonić do hurtowni w sprawie rabatu', priorytet: 1, grupa: 'Bieżące', status: 'Do zrobienia', termin: '2026-11-02' }),
      t({ tekst: 'Uzupełnić wycenę dla Mazura', priorytet: 2, grupa: 'Bieżące', status: 'W toku', uwagi: 'https://example.com/wycena' }),
    ] },
    { marker: '@CYKLICZNE|g|Cykliczne|cykl', title: 'CYKLICZNE – powtarzalne', row: 30, end: 42, rows: [
      t({ tekst: 'Przegląd samochodów', grupa: 'Cykliczne', status: 'Do zrobienia' }),
    ] },
    { marker: '@FORM|g|form', title: 'FORM', row: 44, end: 66, rows: [t({ tekst: 'Poprawić pola formularza', grupa: 'form', status: 'Do zrobienia' })] },
    { marker: '@FI|g|fi', title: 'FI', row: 68, end: 80, rows: [t({ tekst: 'Faktura za paliwo', grupa: 'fi', status: 'Do zrobienia' })] },
    { marker: '@RÓŻNE|g|Różne', title: 'RÓŻNE', row: 82, end: 104, rows: [t({ tekst: 'Kupić nową drukarkę', priorytet: 3, grupa: 'Różne', status: 'Do zrobienia' })] },
    { marker: '@DŁUGOTERMINOWE|g|Długoterminowe', title: 'DŁUGOTERMINOWE', row: 106, end: 118, rows: [] },
    { marker: '@NOTATKI I LINKI|g|Notatka / link', title: 'NOTATKI I LINKI', row: 120, end: 137, rows: [
      t({ tekst: 'Instrukcja centrali', grupa: 'Notatka / link', status: 'Do zrobienia', uwagi: 'https://example.com/instrukcja' }),
    ] },
  ],
  archive: { marker: '@ZROBIONE|s|Zrobione', title: 'ZROBIONE – archiwum', row: 6, end: 208, rows: [
    t({ tekst: 'Odnowić ubezpieczenie OC', grupa: 'Bieżące', status: 'Zrobione', zrobiono: '2026-09-29' }),
  ] },
};

/** „Zamówione” nie ma odpowiednika w aplikacji (status trafi do uwag). */
const ZAKUPY = {
  left: [
    { marker: '@DO KUPIENIA|s|Do kupienia', title: 'DO KUPIENIA', row: 6, end: 38, rows: [
      b({ co: 'Rura miedziana 1/4', sklep: 'Klimatech', grupa: 'Osprzęt klima', status: 'Do kupienia' }),
      b({ co: 'Taśma izolacyjna', grupa: 'Inne', status: 'Do kupienia' }),
    ] },
    { marker: '@ZAMÓWIONE|s|Zamówione', title: 'ZAMÓWIONE – czekam na dostawę', row: 40, end: 57, rows: [
      b({ co: 'Pompa skroplin', sklep: 'Allegro', grupa: 'Osprzęt klima', status: 'Zamówione', kwota: 249.99, uwagi: 'dostawa w piątek' }),
    ] },
  ],
  archive: { marker: '@KUPIONE|s|Kupione', title: 'KUPIONE – archiwum', row: 6, end: 108, rows: [
    b({ co: 'Klucz dynamometryczny', sklep: 'Castorama', grupa: 'Narzędzia klima', status: 'Kupione', kwota: 180, lista: 'Narzędzia', kupiono: '2026-09-15' }),
    b({ co: 'Wiertła do betonu', grupa: 'Inne', status: 'Kupione' }),
  ] },
};

/** Kolumny E–L: osoby z listy płac (K–L puste), M: uwagi, N–O: osoby spoza płac. */
const PERSONS = [
  { kol: 'E', nazwa: 'Adam', placowa: true }, { kol: 'F', nazwa: 'Bartek', placowa: true },
  { kol: 'G', nazwa: 'Czarek', placowa: true }, { kol: 'H', nazwa: 'Darek', placowa: true },
  { kol: 'N', nazwa: 'Szef', placowa: false }, { kol: 'O', nazwa: 'Podwykonawca', placowa: false },
];
// „Nowk” = literówka w haśle „Nowak”; „Wiśniewska?” = wpis niepewny; „x” = bezpłatny; „urlop o…” = okolicznościowy.
const DAYS: { dzien: string; komorki: Record<string, string>; uwagi?: string }[] = [
  { dzien: '2026-10-05', komorki: { E: 'Kowalski', F: 'Nowak', G: 'Zawoja klima', H: 'Wójcik', N: 'Kowalski' }, uwagi: 'Adam: Zawoja 2 dni' },
  { dzien: '2026-10-06', komorki: { E: 'Kowalski', F: 'Nowak', G: 'Wiśniewska?', H: 'magazyn', O: 'Nowak' } },
  { dzien: '2026-10-07', komorki: { E: 'Kowalski / Nowak', F: 'szkolenie', G: 'x', H: 'urlop okolicznościowy' } },
  { dzien: '2026-10-08', komorki: { E: 'urlop', F: 'Nowk', G: 'Lis', H: 'magazyn' } },
  { dzien: '2026-10-09', komorki: { E: 'urlop n', F: 'L4', G: 'wolne', H: 'Dudek / Wójcik' } },
  // trzy wpisy w dniu, „A / B” bez żadnego hasła, hasło „Lis” tylko wewnątrz słowa, dwa hasła w jednym wpisie
  { dzien: '2026-10-12', komorki: { E: 'Kowalski / Nowak / Lis', F: 'magazyn / biuro', G: 'Kalisz', H: 'Nowak Kowalski' } },
];

const KODY = ['urlop', 'na żądanie', 'L4', 'okolicznościowy', 'bezpłatny', 'wolne'];
const KATEGORIE = [['E', 'elektryka'], ['RW', 'rekuperacja / wentylacja'], ['K', 'klimatyzacja'], ['AM', 'alarmy i monitoring'], ['SH', 'smart home'],
  ['H', 'hydraulika'], ['S', 'sprzedaż'], ['I', 'inne'], ['V', 'zwrot VAT']] as const;

const YEAR_START = '2026-01-01';
const harmRow = (dzien: string): number => 6 + Math.round((Date.parse(dzien) - Date.parse(YEAR_START)) / 86_400_000);

const place = <T>(secs: Sec<T>[]) => secs.flatMap((s) => s.rows.map((r, i) => ({ ...r, wiersz: s.row + 2 + i, sekcja: sectionName(s.marker)! })));

/** Dane atrapy w kształcie odczytu arkusza (to samo, co `readOld` zwraca z pliku z `fixtureXlsx`). */
export function oldFixture(): OldData {
  return oldDataSchema.parse({
    zlecenia: place([...ZLECENIA.left, ZLECENIA.archive]),
    wyceny: place([...WYCENY.left, WYCENY.archive]),
    historia: HISTORIA.map((h, i) => ({ ...h, wiersz: 5 + i })),
    harmonogram: { persons: PERSONS, days: DAYS.map((d) => ({ wiersz: harmRow(d.dzien), dzien: d.dzien, komorki: d.komorki, uwagi: d.uwagi ?? '' })) },
    zadania: place([...ZADANIA.left, ZADANIA.archive]),
    zakupy: place([...ZAKUPY.left, ZAKUPY.archive]),
    parametry: { kategorie: KATEGORIE.map(([kod, nazwa]) => ({ kod, nazwa })), kody: KODY },
  });
}

// --- zapis .xlsx ---

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const formula = (f: string, result: string) => ({ formula: f, result }) as ExcelJS.CellFormulaValue;

function writeTable<T>(ws: ExcelJS.Worksheet, cols: Cols, tb: Table<T>): void {
  const field = new Map(Object.entries(cols).map(([k, [h, kind]]) => [h, { k, kind }]));
  for (const s of tb.secs) {
    ws.getCell(s.row, tb.col - 1).value = formula(`"${s.marker}"`, s.marker); // w oryginale formuła składa znacznik z Parametrów
    ws.getCell(s.row, tb.col).value = s.title;
    ws.mergeCells(s.row, tb.col, s.row, tb.col + tb.headers.length - 1); // tytuł sekcji scalony na szerokość tabeli, jak w oryginale
    tb.headers.forEach((h, i) => { ws.getCell(s.row + 1, tb.col + i).value = h; });
    ws.getCell(s.end, tb.col - 1).value = '@koniec';
    s.rows.forEach((r, n) => {
      const row = s.row + 2 + n;
      ws.getCell(row, tb.col).value = n + 1;
      tb.headers.forEach((h, i) => {
        const f = field.get(h);
        const v = f ? (r as Record<string, unknown>)[f.k] : tb.extra?.[h];
        if (v === null || v === undefined || v === '') return;
        const c = ws.getCell(row, tb.col + i);
        if (f?.kind === 'd') { c.value = asDate(v as string); c.numFmt = 'dd.mm.yyyy'; } else c.value = v as string | number | boolean;
      });
    });
  }
}

function sheet<T>(wb: ExcelJS.Workbook, name: string, title: string, cols: Cols, d: { left: Sec<T>[]; archive: Sec<T> }, h: string[], archiveH: string[], archiveCol: number, extra: Record<string, string | boolean>): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.getCell('B1').value = formula(`"${title} "&RokRozl`, `${title} 2026`);
  ws.getCell('B2').value = 'Wiersze przenoszą się same między sekcjami po zmianie statusu.';
  writeTable(ws, cols, { col: 2, headers: h, secs: d.left });
  writeTable(ws, cols, { col: archiveCol, headers: [...h, ...archiveH], secs: [d.archive], extra });
  return ws;
}

/** Atrapa arkusza jako plik .xlsx (bufor). */
export async function fixtureXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const zl = sheet(wb, SHEETS.zlecenia, 'ZLECENIA', COLS.zlecenia, ZLECENIA, JOB_H, ['Zamknięto', 'Z sekcji'], 18, { 'Z sekcji': 'AKTUALNE' });
  zl.getCell(HEADER_ROW.zlecenia, 2 + JOB_H.length).value = 'Tydz.'; // tylko lewa tabela ma „Tydz.” (archiwum ma tam „Zamknięto”)
  const wy = sheet(wb, SHEETS.wyceny, 'WYCENY I LEADY', COLS.wyceny, WYCENY, LEAD_H, ['Zamknięto', 'Z sekcji'], 18, { 'Z sekcji': 'NA JUŻ' });
  for (let r = 8; r < 158; r++) wy.getCell(r, 18 + LEAD_H.indexOf('✓ Kontakt odbyty')).value = false; // pola wyboru wypełnione w całym archiwum

  const harm = wb.addWorksheet(SHEETS.harmonogram);
  harm.getCell('B1').value = 'HARMONOGRAM PRAC 2026';
  harm.getCell('R1').value = 'LEGENDA KODÓW';
  KODY.forEach((k, i) => { harm.getCell(2 + Math.floor(i / 3), 18 + (i % 3)).value = k; });
  harm.getCell('D3').value = 'Urlop wykorzystany (dni):';
  harm.getCell('D4').value = 'Pozostało płatnych (dni):';
  const hr = HEADER_ROW.harmonogram;
  ['Tydz.', 'Data', 'Dzień', 'Święto / miesiąc'].forEach((h, i) => { harm.getCell(hr, 1 + i).value = h; });
  PERSONS.forEach((p, i) => { harm.getCell(`${p.kol}${hr}`).value = formula(`Pracownicy!C${7 + i}`, p.nazwa); });
  harm.getCell(`M${hr}`).value = 'Uwagi / możliwe zlecenia';
  harm.getCell(`P${hr}`).value = 'mies.';
  harm.getCell(`Q${hr}`).value = 'rob.';
  const WD = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  for (let d = YEAR_START; d < '2027-01-01'; d = addDays(d, 1)) {
    const r = harmRow(d), wd = asDate(d).getUTCDay();
    harm.getCell(r, 2).value = asDate(d);
    harm.getCell(r, 2).numFmt = 'dd.mm.yyyy';
    harm.getCell(r, 3).value = WD[wd]!;
    harm.getCell(r, 16).value = Number(d.slice(5, 7));
    harm.getCell(r, 17).value = wd === 0 || wd === 6 ? 0 : 1;
  }
  for (const d of DAYS) {
    for (const [kol, v] of Object.entries(d.komorki)) harm.getCell(`${kol}${harmRow(d.dzien)}`).value = v;
    if (d.uwagi) harm.getCell(`M${harmRow(d.dzien)}`).value = d.uwagi;
  }

  sheet(wb, SHEETS.zadania, 'ZADANIA I NOTATKI', COLS.zadania, ZADANIA, TASK_H, ['Zrobiono', 'Z sekcji'], 10, { 'Z sekcji': 'BIEŻĄCE' });
  sheet(wb, SHEETS.zakupy, 'ZAKUPY', COLS.zakupy, ZAKUPY, BUY_H, ['Kupiono', 'Z sekcji'], 11, { 'Z sekcji': 'z notatek' });

  const hist = wb.addWorksheet(SHEETS.historia, { state: 'hidden' });
  hist.getCell('B1').value = 'HISTORIA KONTAKTÓW';
  const histH = ['Lp.', ...Object.values(COLS.historia).map(([h]) => h)];
  histH.forEach((h, i) => { hist.getCell(HEADER_ROW.historia, 2 + i).value = h; });
  HISTORIA.forEach((h, n) => {
    const row = HEADER_ROW.historia + 1 + n;
    hist.getCell(row, 2).value = n + 1;
    Object.entries(COLS.historia).forEach(([k, [, kind]], i) => {
      const v = h[k as keyof typeof h];
      if (v === null || v === '') return;
      hist.getCell(row, 3 + i).value = kind === 'd' ? asDate(v) : v;
    });
  });

  const par = wb.addWorksheet(SHEETS.parametry);
  par.getCell('B57').value = '4. LISTY WYBORU';
  par.getCell('D58').value = 'Kody w harmonogramie';
  KODY.forEach((k, i) => { par.getCell(59 + i, 4).value = k; });
  par.getCell('B79').value = '6. LISTY: PRZYCHODY';
  par.getCell('B80').value = 'Kategoria – kod';
  par.getCell('C80').value = 'Nazwa kategorii';
  KATEGORIE.forEach(([kod, nazwa], i) => { par.getCell(81 + i, 2).value = kod; par.getCell(81 + i, 3).value = nazwa; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
