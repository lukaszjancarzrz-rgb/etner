import { ArrowDown, ArrowUp, CaretUpDown } from '@phosphor-icons/react';
import { useState, type HTMLAttributes, type MouseEvent, type TdHTMLAttributes } from 'react';
import { go } from '../../routes.js';
import { cn } from './cn.js';

export type SortVal = string | number | null | undefined;
export type SortDir = 'asc' | 'desc';
type SortProp = { dir?: SortDir; onSort: () => void };

const coll = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });
const empty = (v: SortVal) => v == null || v === '';

/** Stabilne sortowanie: teksty po polsku z liczbami („Z0010” po „Z0009”), puste zawsze na końcu. */
export function sortRows<T>(rows: readonly T[], get: (r: T) => SortVal, dir: SortDir): T[] {
  const m = dir === 'asc' ? 1 : -1;
  return rows.map((r) => ({ r, v: get(r) })).sort((a, b) => {
    if (empty(a.v) || empty(b.v)) return Number(empty(a.v)) - Number(empty(b.v));
    return m * (typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : coll.compare(String(a.v), String(b.v)));
  }).map((x) => x.r);
}

/** Sortowanie tabeli w stanie ekranu; bez kliknięcia zostaje kolejność, w jakiej ekran podał wiersze. */
export function useSort<T, K extends string>(rows: readonly T[], cols: Record<K, (r: T) => SortVal>) {
  const [s, setS] = useState<{ key: K; dir: SortDir } | null>(null);
  return {
    rows: s ? sortRows(rows, cols[s.key], s.dir) : rows,
    by: (key: K): SortProp => ({ dir: s?.key === key ? s.dir : undefined, onSort: () => setS((p) => ({ key, dir: p?.key === key && p.dir === 'asc' ? 'desc' : 'asc' })) }),
  };
}

/** Tabela na komputerze: ramka 1 px, nagłówek przyklejony pod paskiem tytułu (`--th-top`), wiersze z liniami. */
export const Table = ({ className, children, ...p }: HTMLAttributes<HTMLTableElement>) => (
  <table className={cn('w-full table-fixed border-separate border-spacing-0 rounded-[4px] border border-line bg-card text-left tabular-nums [&>tbody>tr:last-child>td]:border-b-0', className)} {...p}>{children}</table>
);

/** Nagłówek kolumny; `sort` = przycisk sortowania z `aria-sort`, `num` = liczby do prawej. */
export function Th({ children, sort, num, className, ...p }: HTMLAttributes<HTMLTableCellElement> & { sort?: SortProp; num?: boolean }) {
  const I = sort?.dir === 'asc' ? ArrowUp : sort?.dir === 'desc' ? ArrowDown : CaretUpDown;
  return (
    <th scope="col" aria-sort={sort?.dir ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('sticky top-[var(--th-top,4rem)] z-10 h-10 border-b-2 border-ink bg-[color-mix(in_srgb,var(--card)_55%,var(--bg))] px-2.5 align-middle font-cond text-sm font-semibold whitespace-nowrap text-ink-2', num && 'text-right', className)} {...p}>
      {sort ? (
        <button type="button" onClick={sort.onSort} className={cn('group inline-flex h-8 max-w-full items-center gap-1 rounded-[3px] hover:text-ink focus-visible:outline-offset-1', num && 'flex-row-reverse', sort.dir && 'text-ink')}>
          <span className="truncate">{children}</span>
          <I className={cn('h-3.5 w-3.5 shrink-0', !sort.dir && 'opacity-40 group-hover:opacity-100')} weight="bold" aria-hidden />
        </button>
      ) : children}
    </th>
  );
}

/** Wiersz: `href`/`onOpen` = klik w wiersz robi to samo co link lub przycisk w nim (klawiatura i czytnik używają tamtych); `selected` = otwarty obok. */
export function Tr({ href, onOpen, selected, className, ...p }: HTMLAttributes<HTMLTableRowElement> & { href?: string; onOpen?: () => void; selected?: boolean }) {
  const act = onOpen ?? (href ? () => go(href) : undefined);
  const open = (e: MouseEvent<HTMLTableRowElement>) => {
    // klik w okienku z portalu (React przekazuje go przez drzewo komponentów) albo w kontrolce w wierszu nie otwiera wiersza
    const t = e.target as Element;
    if (!act || !e.currentTarget.contains(t) || t.closest('a,button,input,label,textarea') || getSelection()?.toString()) return;
    act();
  };
  return <tr onClick={open} className={cn('h-11 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-action', act && 'cursor-pointer', selected ? 'bg-action/10' : 'hover:bg-ink/4', className)} {...p} />;
}

/** Komórka; `pad` zastępuje domyślne odstępy (cn nie scala klas Tailwind), np. `pr-2.5` przy zakładce branży przy krawędzi. */
export const Td = ({ num, pad = 'px-2.5 py-1.5', className, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; pad?: string }) => (
  <td className={cn('truncate border-b border-rule align-middle', pad, num && 'text-right', className)} {...p} />
);

