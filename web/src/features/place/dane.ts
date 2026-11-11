import { useEffect, useMemo, useState } from 'react';
import type { Parametry } from '@etner/shared';
import { api } from '../../core/api.js';
import { today, useDict } from '../../core/data.js';
import { useEntities } from '../../core/store.js';
import type { KosztDnia } from '../finanse/model.js';
import { useStawka } from '../finanse/stawka.js';
import { kosztDnia, kosztyPracownikowMiesiecy, type Dane } from './model.js';

// parametry płac z ustawień (RRRR → Parametry); jedno pobranie na sesję, zmiana w Ustawieniach odświeża przez setParametry
let cache: Record<string, Parametry> | undefined;
const subs = new Set<(v: Record<string, Parametry>) => void>();
export const setParametry = (v: Record<string, Parametry>) => { cache = v; for (const f of subs) f(v); };
export function useParametry(): Record<string, Parametry> | undefined {
  const [v, setV] = useState(cache);
  useEffect(() => {
    subs.add(setV);
    if (cache === undefined) api<Record<string, Parametry>>('/api/settings/place').then(setParametry, () => setV({})); // bez sieci: domyślne, bez zapamiętania (następne wejście spróbuje znowu)
    return () => { subs.delete(setV); };
  }, []);
  return v;
}

/** Dane do liczenia płac (model.ts): synchronizowane tabele, parametry, dni wolne firmy i dzisiejsza data. */
export function useDane(): Dane {
  const people = useEntities('schedule_people'), osoby = useEntities('payroll_people'), stawki = useEntities('payroll_rates'), miesiace = useEntities('payroll_months');
  const wpisy = useEntities('payroll_entries'), entries = useEntities('schedule_entries');
  const wolne = useDict('dzien_wolny'), parametry = useParametry() ?? {};
  return useMemo(() => ({ people, osoby, stawki, miesiace, wpisy, entries, parametry, dzis: today(), dniWolne: wolne.map((d) => d.wartosc as string) }),
    [people, osoby, stawki, miesiace, wpisy, entries, parametry, wolne]);
}

/** Koszt 1 dnia osoby (gr) do robocizny zleceń – pełny koszt firmy z Płac (decyzja D4). */
export function useKosztDnia(): KosztDnia {
  const d = useDane(), stawka = useStawka() ?? 0;
  return useMemo(() => kosztDnia(d, stawka), [d, stawka]);
}

/** Koszty pracowników do Wyniku firmy: ręczne kwoty, nadpisane kosztem z Płac w miesiącach z danymi płac; `zPlac` = te miesiące. */
export function useKosztyPracownikow(rok: string, reczne: Record<string, number>) {
  const d = useDane();
  return useMemo(() => {
    const zPlac = kosztyPracownikowMiesiecy(d, rok);
    return { place: { ...reczne, ...zPlac }, zPlac };
  }, [d, rok, reczne]);
}
