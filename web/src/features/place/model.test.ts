import { PARAMETRY_2026 } from '@etner/shared';
import { describe, expect, it } from 'vitest';
import { czyDzienPracy, dniRobocze, kalkulatorUmowy, kosztDnia, kosztGodziny, minutyCzasu, kosztyPracownikowMiesiecy, podsumowanieRoku, robociznaZlecenia, rodzajNieobecnosci, rozliczenieMiesiaca, type Dane } from './model.js';

const p = PARAMETRY_2026;
const dane = (x: Partial<Dane> = {}): Dane => ({
  people: [{ id: 'a', nazwa: 'Adam', kolejnosc: 1 }, { id: 'b', nazwa: 'Bolek', kolejnosc: 2 }],
  osoby: [
    { id: 'pa', personId: 'a', forma: 'uop', bruttoGr: 480_600, kupGr: null, kosztRecznyGr: null, umowaOd: '2026-03-01', umowaDo: null, urlopDni: 2, etat: 1, staz10: false },
    { id: 'pb', personId: 'b', forma: 'brak', urlopDni: 0 },
  ],
  stawki: [{ id: 's1', personId: 'a', odMiesiaca: '2026-01', stawkaGr: 3000 }, { id: 's2', personId: 'a', odMiesiaca: '2026-04', stawkaGr: 3500 }, { id: 's3', personId: 'b', odMiesiaca: '2026-01', stawkaGr: 2000 }],
  miesiace: [{ id: 'm1', personId: 'a', miesiac: '2026-04', godziny: 100, kosztUmowyGr: null }, { id: 'm2', personId: 'b', miesiac: '2026-04', godziny: 10, kosztUmowyGr: null }],
  wpisy: [
    { id: 'w1', personId: 'a', miesiac: '2026-04', rodzaj: 'premia', kwotaGr: 10_000 },
    { id: 'w2', personId: 'a', miesiac: '2026-04', rodzaj: 'zaliczka', kwotaGr: 50_000 },
    { id: 'w3', personId: 'a', miesiac: '2026-04', rodzaj: 'przelew', kwotaGr: 100_000 },
    { id: 'w4', personId: 'a', miesiac: '2026-04', rodzaj: 'inny', kwotaGr: 2_000 },
    { id: 'w5', personId: 'a', miesiac: '2026-04', rodzaj: 'premia', kwotaGr: 99_999, deletedAt: 'x' },
  ],
  entries: [], parametry: {}, dzis: '2026-11-11', dniWolne: [], ...x,
});

describe('kalkulatorUmowy', () => {
  it('płaca minimalna na umowie o pracę (KUP 250 zł) – wzory arkusza', () => {
    expect(kalkulatorUmowy(480_600, 'uop', null, p)).toEqual({ spoleczne: 65_891, zdrowotna: 37_324, pit: 16_800, netto: 360_585, zusPracodawcy: 98_428, kosztPracodawcy: 579_028, kosztUmowy: 218_443 });
  });
  it('KUP osoby 300 zł obniża koszt o PIT; poniżej płacy minimalnej bez Funduszu Pracy; bez umowy = 0', () => {
    expect(kalkulatorUmowy(480_600, 'uop', 30_000, p).kosztUmowy).toBe(217_843);
    expect(kalkulatorUmowy(240_300, 'uop', null, p).zusPracodawcy).toBe(Math.round(240_300 * p.emF) + Math.round(240_300 * p.rentF) + Math.round(240_300 * p.wyp) + Math.round(240_300 * p.fgsp));
    expect(kalkulatorUmowy(480_600, 'brak', null, p).kosztUmowy).toBe(0);
  });
});

describe('nieobecności i dni pracy', () => {
  it('rozpoznaje kody jak arkusz', () => {
    expect(['urlop', 'Urlop wypoczynkowy', 'na żądanie', 'urlop na żądanie', 'UŻ', 'L4', 'okolicznościowy', 'urlop okolicznościowy', 'bezpłatny', 'urlop bezpłatny', 'x', 'wolne', 'szkolenie'].map(rodzajNieobecnosci))
      .toEqual(['wypoczynkowy', 'wypoczynkowy', 'naZadanie', 'naZadanie', 'naZadanie', 'L4', 'okolicznosciowy', 'okolicznosciowy', 'bezplatny', 'bezplatny', 'bezplatny', null, null]);
    expect(czyDzienPracy({ id: '1', rodzaj: 'zlecenie', jobId: 'j' })).toBe(true);
    expect(czyDzienPracy({ id: '1', rodzaj: 'kod', kod: 'wolne' })).toBe(false);
    expect(czyDzienPracy({ id: '1', rodzaj: 'kod', kod: 'L4' })).toBe(false);
  });
  it('dni robocze: kwiecień 2026 bez Poniedziałku Wielkanocnego', () => {
    expect(dniRobocze('2026-04', [])).toBe(21);
  });
});

describe('rozliczenieMiesiaca', () => {
  it('liczy wypłatę, urlop płatny do limitu, premie, zaliczki, koszt umowy i koszt całkowity', () => {
    const urlop = (dzien: string, polDnia = false) => ({ id: dzien, personId: 'a', dzien, rodzaj: 'kod', kod: 'urlop', polDnia });
    // marzec: 1,5 dnia (w tym sobota się nie liczy); kwiecień: 2 dni → limit 2: płatne 0,5 w kwietniu, reszta darmowa
    const d = dane({ entries: [urlop('2026-03-02'), urlop('2026-03-03', true), urlop('2026-03-07'), urlop('2026-04-07'), urlop('2026-04-08')] });
    const { wiersze, razem } = rozliczenieMiesiaca(d, '2026-04');
    const a = wiersze.find((w) => w.personId === 'a')!;
    expect(a).toMatchObject({ godziny: 100, stawka: 3500, wyplata: 350_000, urlopDni: 0.5, urlop: 14_000, premie: 10_000, nalezne: 374_000, zaliczki: 150_000, doWyplaty: 224_000, kosztUmowy: 218_443, inne: 2_000, darmoweDni: 1.5 });
    expect(a.koszt).toBe(374_000 + 218_443 + 2_000);
    expect(razem.wyplata).toBe(350_000 + 20_000);
    expect(rozliczenieMiesiaca(d, '2026-03').wiersze[0]).toMatchObject({ stawka: 3000, urlopDni: 1.5 });
  });
  it('koszt umowy: nie przed umową, nie w przyszłości, ręczna zmiana miesiąca i koszt ręczny osoby mają pierwszeństwo', () => {
    expect(rozliczenieMiesiaca(dane(), '2026-02').wiersze[0]!.kosztUmowy).toBe(0);
    expect(rozliczenieMiesiaca(dane(), '2026-12').wiersze[0]!.kosztUmowy).toBe(0);
    const d = dane({ miesiace: [{ id: 'm', personId: 'a', miesiac: '2026-05', godziny: null, kosztUmowyGr: 123 }] });
    expect(rozliczenieMiesiaca(d, '2026-05').wiersze[0]!.kosztUmowy).toBe(123);
    const r = dane();
    r.osoby[0]!.kosztRecznyGr = 100_820;
    expect(rozliczenieMiesiaca(r, '2026-06').wiersze[0]!.kosztUmowy).toBe(100_820);
  });
});

describe('podsumowanie i Wynik firmy', () => {
  it('sumuje rok i koszt 1 h; koszty pracowników tylko dla miesięcy z danymi płac', () => {
    const d = dane();
    const s = podsumowanieRoku(d, '2026');
    expect(s.razem.godziny).toBe(110);
    expect(s.osoby.map((o) => o.nazwa)).toEqual(['Adam', 'Bolek']);
    const k = kosztyPracownikowMiesiecy(d, '2026');
    expect(Object.keys(k)).toEqual(['2026-04']);
    expect(k['2026-04']).toBe(s.miesiace[3]!.koszt);
    // sama zaliczka (wypłata, nie koszt) nie przełącza miesiąca na Płace; premia tak
    const z = dane({ wpisy: [{ id: 'z', personId: 'a', miesiac: '2026-07', rodzaj: 'zaliczka', kwotaGr: 1 }, { id: 'p', personId: 'a', miesiac: '2026-08', rodzaj: 'premia', kwotaGr: 1 }] });
    expect(Object.keys(kosztyPracownikowMiesiecy(z, '2026'))).toEqual(['2026-04', '2026-08']);
    expect(s.razem.koszt1h).toBe(Math.round(s.razem.koszt / 110));
  });
});

describe('robocizna zlecenia', () => {
  it('koszt dnia = koszt osoby (urlop jako 1/12 limitu) ÷ dni pracy; bez godzin ze stawki i kosztu umowy; bez płac – stawka osobodnia', () => {
    const praca = (id: string, personId: string, dzien: string, jobId: string, polDnia = false) => ({ id, personId, dzien, rodzaj: 'zlecenie', jobId, polDnia });
    const entries = [praca('1', 'a', '2026-04-01', 'J'), praca('2', 'a', '2026-04-02', 'J', true), praca('3', 'a', '2026-04-03', 'K'), praca('4', 'a', '2026-05-04', 'J'), praca('5', 'x', '2026-04-01', 'J'), { id: '6', personId: 'a', dzien: '2026-04-07', rodzaj: 'kod', kod: 'urlop', polDnia: false }];
    const d = dane({ entries });
    const koszt = kosztDnia(d, 40_000);
    const kw = rozliczenieMiesiaca(d, '2026-04').wiersze[0]!;
    const urlop12 = (2 * 8 * 3500) / 12; // 1/12 limitu urlopu (2 dni) zamiast urlopu wziętego w kwietniu
    expect(kw.urlop).toBeGreaterThan(0);
    expect(koszt('a', '2026-04')).toBe(Math.round((kw.koszt - kw.urlop + urlop12) / 2.5));
    expect(koszt('a', '2026-05')).toBe(Math.round((3500 + (218_443 + urlop12) / (8 * dniRobocze('2026-05', []))) * 8));
    expect(koszt('x', '2026-04')).toBe(40_000);
    expect(koszt('b', '2026-06')).toBe(Math.round(2000 * 8)); // bez godzin: stawka × godziny dnia
    expect(robociznaZlecenia('J', entries, koszt)).toBe(Math.round(1.5 * koszt('a', '2026-04') + koszt('a', '2026-05') + 40_000));
  });
  it('koszt godziny (Czasomierz) = koszt osoby ÷ godziny z czasomierza; bez godzin w Płacach – stawka + koszt umowy ÷ wymiar', () => {
    const czas = [
      { id: 't1', personId: 'a', dzien: '2026-04-01', od: '2026-04-01T05:00:00Z', do: '2026-04-01T13:00:00Z' },
      { id: 't2', personId: 'a', dzien: '2026-04-02', od: '2026-04-02T05:00:00Z', do: '2026-04-02T07:00:00Z' },
      { id: 't3', personId: 'a', dzien: '2026-04-03', od: '2026-04-03T05:00:00Z', do: '2026-04-03T07:00:00Z', deletedAt: 'x' },
    ];
    expect(minutyCzasu(czas).get('a|2026-04')).toBe(600);
    const d = dane({ czas });
    const kw = rozliczenieMiesiaca(d, '2026-04').wiersze[0]!;
    const urlop12 = (2 * 8 * 3500) / 12;
    const k = kosztGodziny(d, 40_000);
    expect(k('a', '2026-04')).toBe(Math.round((kw.koszt - kw.urlop + urlop12) / 10));
    expect(k('a', '2026-05')).toBe(Math.round(3500 + (218_443 + urlop12) / (8 * dniRobocze('2026-05', []))));
    expect(k('x', '2026-04')).toBe(5_000); // stawka osobodnia ÷ 8 h
    // miesiąc w toku (dzis 2026-04-15): godziny w Płacach niepełne → szacunek ze stawki, nie koszt ÷ godziny
    const wToku = dane({ czas, dzis: '2026-04-15' });
    expect(kosztGodziny(wToku, 40_000)('a', '2026-04')).toBe(Math.round(3500 + (218_443 + urlop12) / (8 * dniRobocze('2026-04', []))));
    // miesiąc mieszany: dzień z harmonogramu bez czasomierza liczy się jako 8 h (start czasomierza w połowie miesiąca)
    const mix = dane({ czas, entries: [{ id: 'e1', personId: 'a', dzien: '2026-04-01', rodzaj: 'zlecenie', jobId: 'J' }, { id: 'e2', personId: 'a', dzien: '2026-04-09', rodzaj: 'zlecenie', jobId: 'J' }] });
    const km = rozliczenieMiesiaca(mix, '2026-04').wiersze[0]!;
    expect(kosztGodziny(mix, 40_000)('a', '2026-04')).toBe(Math.round((km.koszt - km.urlop + urlop12) / 18));
    expect(kosztDnia(mix, 40_000)('a', '2026-04')).toBe(Math.round((km.koszt - km.urlop + urlop12) / 18 * 8));
  });
});
