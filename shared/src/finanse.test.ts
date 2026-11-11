import { describe, expect, it } from 'vitest';
import { miesiacPrzychodu, rozbij } from './finanse.js';
import { kpirFileSchema } from './schemas/finanse.js';

describe('rozbij', () => {
  it('VAT z brutto', () => {
    expect(rozbij(10800, 'vat8')).toEqual({ nettoGr: 10000, vatGr: 800 });
    expect(rozbij(12300, 'vat23')).toEqual({ nettoGr: 10000, vatGr: 2300 });
    const r = rozbij(1850050, 'vat8');
    expect(r.nettoGr + r.vatGr).toBe(1850050);
  });
  it('bez VAT', () => {
    expect(rozbij(5000, 'bez')).toEqual({ nettoGr: 5000, vatGr: 0 });
    expect(rozbij(5000, 'zwrot')).toEqual({ nettoGr: 5000, vatGr: 0 });
  });
});

describe('miesiacPrzychodu', () => {
  it('inny miesiąc ma pierwszeństwo', () => {
    expect(miesiacPrzychodu('2026-10-28', null)).toBe('2026-10');
    expect(miesiacPrzychodu('2026-10-28', '2026-11')).toBe('2026-11');
    expect(miesiacPrzychodu(null, null)).toBeNull();
  });
});

describe('kpirFileSchema', () => {
  const ok = { format: 'etner-kpir-1', miesiac: '2026-10', kpir: { przychod: 1, towary: 1, uboczne: 0, wynagrodzenia: 0, pozostale: 0 },
    koszty: [{ data: '2026-10-03', nrDokumentu: 'FV/1', kontrahent: 'X', opis: 'Y', kategoria: 'Inne', netto: 12.5, kolumnaKpir: 12 }] };
  it('przyjmuje poprawny plik, odrzuca kolumnę 11 i brak formatu', () => {
    expect(kpirFileSchema.safeParse(ok).success).toBe(true);
    expect(kpirFileSchema.safeParse({ ...ok, koszty: [{ ...ok.koszty[0], kolumnaKpir: 11 }] }).success).toBe(false);
    const { format: _f, ...bez } = ok;
    expect(kpirFileSchema.safeParse(bez).success).toBe(false);
  });
});
