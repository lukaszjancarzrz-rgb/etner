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

/** Tabele biznesowe: tabele wszystkich modułów + firmy + users (nowy moduł eksportuje się sam). Bez sessions, op_ids, push_subscriptions, changes, errors, settings i „widzianych” (job_seen). */
export function tablesForExport(defs: ModuleDef[]): Record<string, SQLiteTable> {
  const out: Record<string, SQLiteTable> = { firmy, users };
  for (const d of defs) Object.assign(out, d.tables);
  delete out.job_seen;
  return out;
}

const SECRET_COLS = new Set(['password_hash']);

/** Wartość komórki: `*_gr` jako zł (liczba), boolean jako TRUE/FALSE, reszta tekst/liczba, NULL jako pusty. */
function cell(name: string, boolean: boolean, v: unknown): Cell {
  if (v === null || v === undefined) return '';
  if (boolean) return v ? 'TRUE' : 'FALSE';
  if (name.endsWith('_gr') && typeof v === 'number') return Math.round(v) / 100;
  return typeof v === 'number' ? v : String(v).slice(0, MAX_CELL);
}

const MAX_CELL = 50000; // limit komórki w Arkuszach Google
const CHUNK = 2000;

/** Czyści i zapisuje od nowa każdą kartę osobno (porcjami), `_info` na końcu. Błąd jednej karty nie opróżnia pozostałych; zwraca liczbę wierszy per tabela. */
export async function exportToSheets(
  db: Db, sheets: SheetsClient, spreadsheetId: string, tables: Record<string, SQLiteTable>, now = new Date(), chunk = CHUNK,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const all: { title: string; values: Cell[][] }[] = [];
  for (const [name, t] of Object.entries(tables)) {
    const cols = getTableConfig(t).columns.filter((c) => !SECRET_COLS.has(c.name));
    const rows = db.$client.prepare(`SELECT ${cols.map((c) => `"${c.name}"`).join(',')} FROM "${name}"`).all() as Record<string, unknown>[];
    counts[name] = rows.length;
    all.push({ title: name, values: [cols.map((c) => c.name), ...rows.map((r) => cols.map((c) => cell(c.name, c.dataType === 'boolean', r[c.name])))] });
  }
  all.push({ title: '_info', values: [['eksport', now.toISOString()], ...Object.entries(counts).map(([k, n]): Cell[] => [k, n])] });
  await sheets.ensureSheets(spreadsheetId, all.map((x) => x.title));
  for (const { title, values } of all) {
    await sheets.clear(spreadsheetId, [`'${title}'`]);
    for (let i = 0; i < values.length; i += chunk) {
      await sheets.batchUpdate(spreadsheetId, [{ range: `'${title}'!A${i + 1}`, values: values.slice(i, i + chunk) }]);
    }
  }
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
