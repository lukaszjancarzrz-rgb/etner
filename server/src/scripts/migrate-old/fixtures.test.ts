import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { fixtureXlsx, oldFixture } from './fixtures.js';
import { SHEETS } from './layout.js';
import { oldDataSchema } from './old-data.js';

describe('atrapa arkusza Firma_2026', () => {
  it('oldFixture przechodzi schemat OldData i ma celowe przypadki', () => {
    const d = oldFixture();
    expect(oldDataSchema.safeParse(d).success).toBe(true);
    const tel = d.zlecenia.filter((z) => z.klient === 'Jan Kowalski').map((z) => z.kontakt);
    expect(tel).toEqual(['727 728 903', '+48727728903']);
    expect(d.harmonogram.days.flatMap((x) => Object.values(x.komorki))).toEqual(expect.arrayContaining(['Kowalski / Nowak', 'urlop', 'szkolenie', 'Nowk']));
    expect(d.harmonogram.persons.some((p) => !p.placowa)).toBe(true);
    expect(d.zlecenia.some((z) => z.kat === 'H')).toBe(true);
    expect(d.zakupy.some((z) => z.status === 'Zamówione')).toBe(true);
    expect(d.zadania.map((z) => z.grupa)).toEqual(expect.arrayContaining(['form', 'fi']));
  });

  it('plik .xlsx ma karty, znaczniki sekcji w kolumnie A i nagłówki w wierszach jak oryginał', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await fixtureXlsx() as never);
    expect(Object.values(SHEETS).every((n) => wb.getWorksheet(n))).toBe(true);
    const zl = wb.getWorksheet(SHEETS.zlecenia)!;
    expect((zl.getCell('A6').value as ExcelJS.CellFormulaValue).result).toBe('@AKTUALNE|s|Planowane;W realizacji');
    expect((zl.getCell('Q6').value as ExcelJS.CellFormulaValue).result).toBe('@ZAKOŃCZONE|s|Do rozliczenia;Rozliczone;Anulowane');
    expect(zl.getCell('H7').value).toBe('Inwestor / klient');
    expect(zl.getCell('AF7').value).toBe('Zamknięto');
    expect(zl.getCell('H8').value).toBe('Jan Kowalski');
    expect(wb.getWorksheet(SHEETS.harmonogram)!.getCell('B6').value).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(wb.getWorksheet(SHEETS.historia)!.state).toBe('hidden');
  });
});
