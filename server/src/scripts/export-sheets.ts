import { google } from 'googleapis';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { Db } from '../core/db.js';
import type { ModuleDef } from '../core/registry.js';
import { firmy, users } from '../core/schema-base.js';

export type Cell = string | number;
export interface SheetsClient {
  /** Tworzy brakujące karty. */
  ensureSheets(id: string, titles: string[]): Promise<void>;
  clear(id: string, ranges: string[]): Promise<void>;
  /** Zapis z `valueInputOption: 'RAW'`. */
  batchUpdate(id: string, data: { range: string; values: Cell[][] }[]): Promise<void>;
}

/** Tabele biznesowe: tabele wszystkich modułów + firmy + users (nowy moduł eksportuje się sam). Bez sessions, op_ids, push_subscriptions, changes, errors, settings. */
export function tablesForExport(defs: ModuleDef[]): Record<string, SQLiteTable> {
  const out: Record<string, SQLiteTable> = { firmy, users };
  for (const d of defs) Object.assign(out, d.tables);
  return out;
}

const SECRET_COLS = new Set(['token_hash']);

/** Wartość komórki: `*_gr` jako zł (liczba), boolean jako TRUE/FALSE, reszta tekst/liczba, NULL jako pusty. */
function cell(name: string, boolean: boolean, v: unknown): Cell {
  if (v === null || v === undefined) return '';
  if (boolean) return v ? 'TRUE' : 'FALSE';
  if (name.endsWith('_gr') && typeof v === 'number') return Math.round(v) / 100;
  return typeof v === 'number' ? v : String(v);
}

/** Czyści i zapisuje od nowa każdą kartę + `_info`; zwraca liczbę wierszy per tabela. */
export async function exportToSheets(
  db: Db, sheets: SheetsClient, spreadsheetId: string, tables: Record<string, SQLiteTable>, now = new Date(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const data: { range: string; values: Cell[][] }[] = [];
  for (const [name, t] of Object.entries(tables)) {
    const cols = getTableConfig(t).columns.filter((c) => !SECRET_COLS.has(c.name));
    const rows = db.$client.prepare(`SELECT ${cols.map((c) => `"${c.name}"`).join(',')} FROM "${name}"`).all() as Record<string, unknown>[];
    counts[name] = rows.length;
    data.push({ range: `'${name}'!A1`, values: [cols.map((c) => c.name), ...rows.map((r) => cols.map((c) => cell(c.name, c.dataType === 'boolean', r[c.name])))] });
  }
  data.push({ range: `'_info'!A1`, values: [['eksport', now.toISOString()], ...Object.entries(counts).map(([k, n]): Cell[] => [k, n])] });
  const titles = data.map((d) => d.range.slice(1, d.range.indexOf("'!")));
  await sheets.ensureSheets(spreadsheetId, titles);
  await sheets.clear(spreadsheetId, titles.map((t) => `'${t}'`));
  await sheets.batchUpdate(spreadsheetId, data);
  return counts;
}

/** Prawdziwy klient: konto usługi z JSON-a (GOOGLE_SA_JSON). */
export function googleSheets(saJson: string): SheetsClient {
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(saJson), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const api = google.sheets({ version: 'v4', auth });
  return {
    async ensureSheets(id, titles) {
      const have = new Set((await api.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' })).data.sheets?.map((s) => s.properties?.title));
      const requests = titles.filter((t) => !have.has(t)).map((title) => ({ addSheet: { properties: { title } } }));
      if (requests.length) await api.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
    },
    async clear(id, ranges) { await api.spreadsheets.values.batchClear({ spreadsheetId: id, requestBody: { ranges } }); },
    async batchUpdate(id, data) {
      await api.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'RAW', data } });
    },
  };
}
