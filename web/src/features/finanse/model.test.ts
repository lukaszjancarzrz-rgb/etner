import { describe, expect, it } from 'vitest';
import { kontrolaKpir, rozliczoneBezPrzychodu, statystyki, sumaMiesiaca, wynikiZlecen, wynikRoku, wynikZlecenia } from './model.js';

describe('rozliczoneBezPrzychodu', () => {
  it('zwraca „Rozliczone” bez przychodu, pomija z przychodem, „Zakończone” i usunięte przychody nie liczą się', () => {
    const jobs = [
      { id: 'a', status: 'Rozliczone' }, { id: 'b', status: ' rozliczone ' }, { id: 'c', status: 'Rozliczone' },
      { id: 'd', status: 'Zakończone' }, { id: 'e', status: 'Rozliczone', deletedAt: 'x' },
    ];
    const revs = [{ id: 'r1', jobId: 'b' }, { id: 'r2', jobId: 'c', deletedAt: 'x' }];
    expect(rozliczoneBezPrzychodu(jobs, revs).map((j) => j.id)).toEqual(['a', 'c']);
  });
});

describe('sumaMiesiaca', () => {
  it('liczy tylko dany miesiąc i pomija usunięte; sam rok sumuje cały rok', () => {
    const rows = [
      { id: '1', miesiac: '2026-10', nettoGr: 100 }, { id: '2', miesiac: '2026-10', nettoGr: 250 },
      { id: '3', miesiac: '2026-11', nettoGr: 999 }, { id: '4', miesiac: '2026-10', nettoGr: 5, deletedAt: 'x' },
    ];
    expect(sumaMiesiaca(rows, '2026-10')).toBe(350);
    expect(sumaMiesiaca(rows, '2026')).toBe(1349);
  });
});

describe('3b: wynik, kontrola KPiR, statystyki', () => {
  const rev = (o: object) => ({ id: Math.random().toString(), dzien: '2026-03-10', innyMiesiac: null, nettoGr: 0, ...o });
  it('wynikRoku: przychód z fakturą/bez, zwrot osobno, koszty do wyniku, płace, narastająco, zlecenie gotówka+FV liczone raz', () => {
    const revenues = [rev({ sposob: 'bez', nettoGr: 1000, jobId: 'j1' }), rev({ sposob: 'vat8', nettoGr: 5000, jobId: 'j1' }), rev({ sposob: 'zwrot', nettoGr: 300, jobId: null, klient: 'US' }),
      rev({ sposob: 'bez', nettoGr: 9999, deletedAt: 'x' }), rev({ sposob: 'bez', nettoGr: 2000, dzien: '2026-04-01', jobId: 'j2' })];
    const costs = [{ id: 'c1', miesiac: '2026-03', nettoGr: 1500, doWyniku: true }, { id: 'c2', miesiac: '2026-03', nettoGr: 700, doWyniku: false }];
    const w = wynikRoku(revenues, costs, { '2026-03': 500 }, '2026');
    expect(w).toHaveLength(13);
    expect(w[2]).toMatchObject({ zFaktura: 5000, bezFaktury: 1000, przychod: 6000, kosztyFirmy: 1500, kosztyPracownikow: 500, wynik: 4000, zlecen: 1, srednia: 6000, zwrotVat: 300, wynikZeZwrotem: 4300 });
    expect(w[3]).toMatchObject({ przychod: 2000, wynik: 2000, narastajaco: 6000 });
    expect(w[12]).toMatchObject({ miesiac: '2026', przychod: 8000, wynik: 6000, zlecen: 2, zwrotVat: 300 });
  });
  it('kontrolaKpir: księga vs aplikacja wg kolumn, puste miesiące pominięte', () => {
    const k = kontrolaKpir([{ id: 'k', miesiac: '2026-03', przychodGr: 5000, towaryGr: 1000, uboczneGr: 0, wynagrodzeniaGr: 0, pozostaleGr: 200 }],
      [rev({ sposob: 'vat23', nettoGr: 5000 }), rev({ sposob: 'bez', nettoGr: 800 })], [{ id: 'c', miesiac: '2026-03', nettoGr: 900, kolumnaKpir: 12, doWyniku: true }], '2026');
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ miesiac: '2026-03', ksiega: { przychod: 5000, towary: 1000, pozostale: 200 }, app: { przychod: 5000, towary: 900, pozostale: 0 } });
  });
  it('statystyki: osobodni wg branży i ekipy, pół dnia, tylko wybrany rok', () => {
    const jobs = [{ id: 'a', kategoria: 'Rekuperacja', ekipa: 'ekipa Bartek' }, { id: 'b', kategoria: 'Elektryka', ekipa: 'ekipa Marek' }];
    const e = (jobId: string, dzien: string, polDnia = false) => ({ id: jobId + dzien + polDnia, jobId, dzien, polDnia });
    const s = statystyki([e('a', '2026-01-02'), e('a', '2026-01-05'), e('b', '2026-01-02', true), e('a', '2025-12-30')], jobs, '2026');
    expect(s.razem).toBe(2.5);
    expect(s.kategorie[0]).toMatchObject({ nazwa: 'Rekuperacja', zlecen: 1, dni: 2, srednio: 2, udzial: 0.8 });
    expect(s.ekipy.find((x) => x.nazwa === 'ekipa Marek')).toMatchObject({ dni: 0.5 });
    expect(s.krzyz.get('Rekuperacja\u0000ekipa Bartek')).toBe(2);
  });
});

describe('3c: wynik zlecenia', () => {
  const revenues = [{ id: 'r1', jobId: 'j', sposob: 'vat8', nettoGr: 1_850_000, materialyGr: 800_000, dzien: '2026-10-01' }, { id: 'r2', jobId: 'j', sposob: 'bez', nettoGr: 150_000, materialyGr: null, dzien: '2026-10-01' },
    { id: 'r3', jobId: 'j', sposob: 'zwrot', nettoGr: 99_999, dzien: '2026-10-01' }, { id: 'r4', jobId: 'j', sposob: 'bez', nettoGr: 5, deletedAt: 'x', dzien: '2026-10-01' }];
  const entries = [{ id: 'e1', jobId: 'j', dzien: '2026-09-01' }, { id: 'e2', jobId: 'j', dzien: '2026-09-02', polDnia: true }, { id: 'e3', jobId: 'inne', dzien: '2026-09-02' }];
  it('przychód − materiały − osobodni × stawka; zwrot VAT i usunięte pominięte', () => {
    expect(wynikZlecenia('j', revenues, entries, 48_000)).toEqual({ przychod: 2_000_000, materialy: 800_000, dni: 1.5, robocizna: 72_000, wynik: 1_128_000, marza: 0.564 });
    expect(wynikZlecenia('brak', revenues, entries, 48_000)).toMatchObject({ przychod: 0, marza: null });
  });
  it('wynikiZlecen: tylko zlecenia z przychodem w roku', () => {
    const w = wynikiZlecen([{ id: 'j' }, { id: 'inne' }], revenues, entries, 0, '2026');
    expect(w.map((x) => x.job.id)).toEqual(['j']);
    expect(wynikiZlecen([{ id: 'j' }], revenues, entries, 0, '2025')).toEqual([]);
  });
});
