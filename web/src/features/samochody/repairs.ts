import { useEffect, useMemo, useState } from 'react';
import { api } from '../../core/api.js';
import { useEntities } from '../../core/store.js';

export type RepairMark = { dzien: string; personId: string; tekst: string; faultId: string };

// Ostatnia odpowiedź na zakres; offline zostaje poprzednia.
// shortcut: nakładka liczona na serwerze (pracownik nie zna ekip innych osób) i trzymana tylko w pamięci; po restarcie offline jej nie ma, do czasu zasięgu.
const cache = new Map<string, RepairMark[]>();

/** Naprawy aut w dniach [from, to] (R41): klucz `dzień|osoba` → oznaczenie. Odświeżane przy zmianie aut, usterek, kont i osób. */
export function useRepairMarks(from: string, to: string): Map<string, RepairMark> {
  const faults = useEntities('car_faults');
  const cars = useEntities('cars');
  const users = useEntities('users');
  const people = useEntities('schedule_people');
  const key = `${from}|${to}`;
  const [marks, setMarks] = useState<RepairMark[]>(() => cache.get(key) ?? []);
  useEffect(() => {
    let on = true;
    setMarks(cache.get(key) ?? []);
    api<{ days: { naprawy?: RepairMark[] }[] }>(`/api/schedule?from=${from}&to=${to}`)
      .then((r) => { const m = r.days.flatMap((d) => d.naprawy ?? []); cache.set(key, m); if (on) setMarks(m); })
      .catch(() => { /* offline: zostaje poprzednie */ });
    return () => { on = false; };
  }, [key, faults, cars, users, people]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => new Map(marks.map((m) => [`${m.dzien}|${m.personId}`, m])), [marks]);
}
