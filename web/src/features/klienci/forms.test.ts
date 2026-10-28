import { expect, it } from 'vitest';
import { clientBody, duplicatePairs, mergedClient, nameKey } from './forms.js';

it('clientBody: przycina, pomija puste i powtórzone wiersze, błędy przy polach', () => {
  const ok = clientBody({ typ: 'osoba', nazwa: ' Jan ', telefony: [' 600 100 100 ', '', '600 100 100'], emaile: ['', 'a@b.pl '], nip: ' ', notatki: ' x ' });
  expect(ok.errors).toEqual({});
  expect(ok.body).toEqual({ typ: 'osoba', nazwa: 'Jan', telefony: ['600 100 100'], emaile: ['a@b.pl'], nip: '', notatki: 'x' });
  const bad = clientBody({ typ: 'firma', nazwa: '  ', telefony: [], emaile: ['ok@x.pl', 'zly-adres'], nip: '', notatki: '' });
  expect(bad.errors).toEqual({ nazwa: 'Podaj nazwę klienta', 'email.1': 'Niepoprawny adres e-mail' });
});

it('duplicatePairs: nazwa po normalizacji (kolejność słów, diakrytyki), telefon bez +48 i spacji, e-mail bez wielkości liter', () => {
  const c = (id: string, nazwa: string, telefony: string[] = [], emaile: string[] = []) => ({ id, nazwa, telefony, emaile, createdAt: `2026-01-0${id}` });
  const list = [
    c('1', 'Jan Kowalski', ['727 728 903']),
    c('2', 'kowalski  JAN.'),
    c('3', 'Firma Łęg', ['+48727728903']),
    c('4', 'Inny', [], ['Biuro@Leg.pl']),
    c('5', 'Inny 2', ['12'], ['biuro@leg.pl ']),
    c('6', 'Bez pary', ['12']),
  ];
  const got = duplicatePairs(list).map((p) => [p.a.id, p.b.id, p.why.join(',')]);
  expect(got.sort()).toEqual([['1', '2', 'nazwa'], ['1', '3', 'telefon'], ['4', '5', 'e-mail']].sort()); // krótki numer „12” to nie para
  expect(nameKey('Łęgowski  Śp.  Józef')).toBe('jozef legowski sp');
});

it('mergedClient: uzupełnia puste pola, sumuje kontakty bez powtórek', () => {
  const m = mergedClient({ id: 'a', nazwa: 'A', telefony: ['727728903'], emaile: ['a@x.pl'], nip: '', notatki: 'x' },
    { id: 'b', nazwa: 'B', telefony: ['+48 727 728 903', '600100100'], emaile: ['A@x.pl', 'b@x.pl'], nip: '9', notatki: 'y' });
  expect(m).toMatchObject({ nazwa: 'A', telefony: ['727728903', '600100100'], emaile: ['a@x.pl', 'b@x.pl'], nip: '9', notatki: 'x\ny' });
});
