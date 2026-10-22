import { describe, expect, it } from 'vitest';
import { fileInfo, fileLine, jobMessages } from './Pumble.js';

describe('Pumble', () => {
  it('jobMessages: tylko to zlecenie, od najstarszej', () => {
    const m = (id: string, jobId: string, sentAt: string) => ({ id, jobId, sentAt });
    expect(jobMessages([m('b', 'j1', '2026-10-21T10:00:00Z'), m('x', 'j2', '2026-10-21T09:00:00Z'), m('a', 'j1', '2026-10-21T09:00:00Z')], 'j1').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('pliki: bez podglądu tylko zdanie o wrzuceniu, nazw nie pokazujemy', () => {
    const m = (files: unknown[]) => ({ id: 'x', files: JSON.stringify({ files }) });
    expect(fileLine('Bartek', fileInfo(m([{ name: 'a.pdf' }])))).toEqual([{ img: false, text: 'Bartek wrzucił plik' }]);
    expect(fileLine('Bartek', fileInfo(m([{ name: 'a.jpg' }, { mimeType: 'image/png' }, { name: 'c.JPG' }, { name: 'x.pdf' }])))).toEqual([
      { img: true, text: 'Bartek wrzucił 3 zdjęcia' }, { img: false, text: 'Bartek wrzucił plik' }]);
    expect(fileLine('B', fileInfo(m(Array.from({ length: 5 }, () => ({ name: 'a.png' })))))[0]!.text).toBe('B wrzucił 5 zdjęć');
  });
  it('pliki: liczy też attachments; liczby mnogie 12, 21, 22', () => {
    expect(fileLine('B', fileInfo({ id: 'x', files: JSON.stringify({ files: [{ name: 'a.pdf' }], attachments: [{ name: 'b.pdf' }] }) }))[0]!.text).toBe('B wrzucił 2 pliki');
    const t = (n: number) => fileLine('B', { images: n, others: 0 })[0]!.text;
    expect([t(12), t(21), t(22)]).toEqual(['B wrzucił 12 zdjęć', 'B wrzucił 21 zdjęć', 'B wrzucił 22 zdjęcia']);
  });
});
