import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';

// stawka osobodnia z ustawień (gr); jedno pobranie na sesję, zmiana w Ustawieniach odświeża przez setStawka
let cache: number | undefined;
const subs = new Set<(v: number) => void>();
export const setStawka = (v: number) => { cache = v; for (const f of subs) f(v); };
export function useStawka(): number | undefined {
  const [v, setV] = useState(cache);
  useEffect(() => {
    subs.add(setV);
    if (cache === undefined) api<{ stawkaOsobodniaGr: number }>('/api/settings/finanse').then((s) => setStawka(s.stawkaOsobodniaGr), () => { /* offline: bez robocizny */ });
    return () => { subs.delete(setV); };
  }, []);
  return v;
}
