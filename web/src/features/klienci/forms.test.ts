import { expect, it } from 'vitest';
import { clientBody } from './forms.js';

it('clientBody: przycina, pomija puste i powtórzone wiersze, błędy przy polach', () => {
  const ok = clientBody({ typ: 'osoba', nazwa: ' Jan ', telefony: [' 600 100 100 ', '', '600 100 100'], emaile: ['', 'a@b.pl '], nip: ' ', notatki: ' x ' });
  expect(ok.errors).toEqual({});
  expect(ok.body).toEqual({ typ: 'osoba', nazwa: 'Jan', telefony: ['600 100 100'], emaile: ['a@b.pl'], nip: '', notatki: 'x' });
  const bad = clientBody({ typ: 'firma', nazwa: '  ', telefony: [], emaile: ['ok@x.pl', 'zly-adres'], nip: '', notatki: '' });
  expect(bad.errors).toEqual({ nazwa: 'Podaj nazwę klienta', 'email.1': 'Niepoprawny adres e-mail' });
});
