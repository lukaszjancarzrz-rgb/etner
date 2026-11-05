import type { Rec } from '../../core/store.js';
import { fmtDay } from '../../core/data.js';

/** Pozycje „do przejrzenia”: nieodhaczone pierwsze, potem w kolejności arkusza (karta, dzień, wiersz). */
export function reviewList(recs: Rec[], showDone: boolean): { open: number; items: Rec[] } {
  const key = (r: Rec) => `${r.arkusz}|${r.dzien ?? ''}|${String(r.wiersz ?? 0).padStart(6, '0')}|${r.osoba}`;
  const items = recs.filter((r) => showDone || !r.przejrzane)
    .sort((a, b) => Number(!!a.przejrzane) - Number(!!b.przejrzane) || key(a).localeCompare(key(b)));
  return { open: recs.filter((r) => !r.przejrzane).length, items };
}

/** „Harmonogram · 08.10.2026 · Bartek” / „Zlecenia · wiersz 12”. */
export const reviewWhere = (r: Rec): string =>
  [r.arkusz, r.dzien ? fmtDay(r.dzien) : r.wiersz ? `wiersz ${r.wiersz}` : '', r.osoba].filter(Boolean).join(' · ');
