import { Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { SectionTitle } from '../../core/ui/bits.js';
import { kw, lb } from './fmt.js';
import { usun } from './zapis.js';

export type Kol = { k: string; label: string; t?: 'h' | 'p'; b?: boolean };
export type Wiersz = { id: string; label: string; v: Record<string, number | null> };

const cell = (v: number | null | undefined, t?: 'h' | 'p') => (v == null ? '—' : t === 'h' ? lb(v) : t === 'p' ? `${Math.round(v * 100)}%` : kw(v));

/** Tabela liczb: wiersz na osobę (albo miesiąc) i wiersz RAZEM; pierwsza kolumna przyklejona, tabela przewija się w bok. */
export function TabelaSum({ title, first, cols, rows, razem }: { title: string; first: string; cols: Kol[]; rows: Wiersz[]; razem?: Record<string, number | null> }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="border-b-2 border-ink font-cond text-ink-2">
            <th scope="col" className="sticky left-0 bg-card px-2.5 py-2 text-left font-semibold">{first}</th>
            {cols.map((c) => <th key={c.k} scope="col" className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">{c.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule">
                <th scope="row" className="sticky left-0 bg-card px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{r.label}</th>
                {cols.map((c) => <td key={c.k} className={cn('px-2.5 py-1.5 text-right whitespace-nowrap', c.b && 'font-bold')}>{cell(r.v[c.k], c.t)}</td>)}
              </tr>
            ))}
            {razem && (
              <tr className="border-t-2 border-ink bg-bg/60 font-bold">
                <th scope="row" className="sticky left-0 bg-bg px-2.5 py-1.5 text-left whitespace-nowrap">RAZEM</th>
                {cols.map((c) => <td key={c.k} className="px-2.5 py-1.5 text-right whitespace-nowrap">{cell(razem[c.k], c.t)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Dwustopniowe usuwanie jak w reszcie aplikacji: pierwszy klik pyta, drugi usuwa. */
export function Usun({ entity, id, url, opis, tmp }: { entity: string; id: string; url: string; opis: string; tmp?: boolean }) {
  const [sure, setSure] = useState(false);
  return (
    <Button variant={sure ? 'danger' : 'ghost'} size="sm" aria-label={sure ? `Na pewno usunąć: ${opis}?` : `Usuń: ${opis}`} disabled={tmp}
      className={cn('min-h-11 min-w-11 desk:min-h-0 desk:min-w-0', !sure && 'w-11 px-0 text-danger desk:w-9')}
      onClick={() => (sure ? usun(entity, id, url) : setSure(true))}>
      {sure ? 'Na pewno?' : <Trash className="h-5 w-5" />}
    </Button>
  );
}
