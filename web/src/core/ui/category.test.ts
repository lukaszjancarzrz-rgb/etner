import { describe, expect, it } from 'vitest';
import { catAbbrevs, inkOn } from './category.js';

describe('catAbbrevs', () => {
  it('stałe skróty właściciela i reszta bez powtórzeń', () => {
    const m = catAbbrevs(['Elektryka', 'Fotowoltaika', 'Rekuperacja', 'Klimatyzacja', 'Alarmy i monitoring', 'Smart home', 'Sprzedaż', 'Inne', 'Elewacje', 'Klimakonwektory']);
    expect(Object.fromEntries(m)).toEqual({
      Elektryka: 'EL', Fotowoltaika: 'PV', Rekuperacja: 'RW', Klimatyzacja: 'KL', 'Alarmy i monitoring': 'AM',
      'Smart home': 'SH', Sprzedaż: 'SP', Inne: 'I', Elewacje: 'EE', Klimakonwektory: 'KI',
    });
    expect(new Set(m.values()).size).toBe(m.size);
  });
  it('stały skrót wygrywa niezależnie od kolejności w słowniku', () => {
    expect(catAbbrevs(['Elewacja', 'Elektryka']).get('Elektryka')).toBe('EL');
    expect(catAbbrevs(['Elewacja', 'Elektryka']).get('Elewacja')).toBe('EE');
  });
  it('krótkie nazwy dostają literę z cyfrą zamiast powtórki', () => {
    const m = catAbbrevs(['A', 'A b', 'AB']);
    expect(new Set(m.values()).size).toBe(3);
  });
});

describe('inkOn', () => {
  it('biały na ciemnym, granatowy na jasnym', () => {
    expect(inkOn('#0070ab')).toBe('#ffffff');
    expect(inkOn('#f9a825')).toBe('#0a2240');
    expect(inkOn('nie-kolor')).toBe('#ffffff');
  });
});
