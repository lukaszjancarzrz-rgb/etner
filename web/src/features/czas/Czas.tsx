import { useIsAdmin } from '../../core/data.js';
import { Admin } from './Admin.js';
import { Moje } from './Moje.js';

/** Czasomierz: pracownik – licznik i „Moje godziny”; admin – Teraz / Wpisy / Sumy / Mój czas. */
export function Czas() {
  const admin = useIsAdmin();
  return admin ? <Admin moj={<Moje />} /> : <section aria-label="Czasomierz" className="mx-auto max-w-2xl px-4 py-4"><Moje /></section>;
}
