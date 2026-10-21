import { getTableColumns, isNull, max } from 'drizzle-orm';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import { requireUser } from './auth.js';
import { changeBusOf, changesSince, type ChangeRow } from './changes.js';
import { can } from './permissions.js';
import { modulesOf } from './registry.js';
import { changes } from './schema-base.js';

// Rekordy w `changes.after` i w snapshocie to wiersze Drizzle z select() (camelCase wg schematu); moduły przekazują ten kształt do recordChange.
export type ChangeOut = { seq: number; entity: string; id: string; action: ChangeRow['action']; data: Record<string, unknown> | null };

const PAGE = 500;
const PING_MS = 25_000;

/** Jedyny filtr widoczności (changes, strumień, snapshot). Domyślnie: tylko admin. `before` nigdy nie wychodzi. */
function toOut(app: Hono, deps: AppDeps, user: User, ch: ChangeRow): ChangeOut | null {
  const owner = modulesOf(app).find((m) => m.tables && ch.entity in m.tables);
  const r = owner?.visibleTo ? owner.visibleTo(user, ch, deps) : can(user, 'admin');
  if (!r) return null;
  const v = r === true ? ch : r;
  return { seq: ch.seq, entity: ch.entity, id: ch.entityId, action: ch.action, data: v.after };
}

export function mountSync(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  /** Podłączone strumienie SSE tej aplikacji (w pamięci procesu). */
  const clients = new Set<{ user: User }>();

  // Strona liczona po surowych wierszach: `last` przeskakuje też zmiany ukryte przed użytkownikiem.
  const page = (user: User, since: number) => {
    const raw = changesSince(db, since, PAGE + 1);
    const rows = raw.slice(0, PAGE);
    const out = rows.flatMap((r) => toOut(app, deps, user, r) ?? []);
    return { out, last: rows.length ? rows[rows.length - 1]!.seq : since, more: raw.length > PAGE };
  };
  const sinceOf = (v: string | undefined) => Math.max(0, Math.floor(Number(v)) || 0);

  app.get('/api/changes', auth, (c) => {
    const { out, last, more } = page(c.get('user'), sinceOf(c.req.query('since')));
    return c.json({ changes: out, last, more });
  });

  // Snapshot: { records: {entity,id,data}[], last }. Kod jest synchroniczny, więc rekordy i `last` są spójne.
  app.get('/api/snapshot', auth, (c) => {
    const user = c.get('user');
    const last = db.select({ m: max(changes.seq) }).from(changes).get()?.m ?? 0;
    const records: { entity: string; id: string; data: Record<string, unknown> | null }[] = [];
    const at = new Date().toISOString();
    for (const m of modulesOf(app)) {
      for (const [entity, table] of Object.entries(m.tables ?? {})) {
        const del = (getTableColumns(table) as Record<string, any>).deletedAt;
        const q = db.select().from(table);
        for (const row of (del ? q.where(isNull(del)) : q).all() as Record<string, any>[]) {
          const o = toOut(app, deps, user, { seq: last, at, userId: null, entity, entityId: row.id, action: 'create', before: null, after: row });
          if (o) records.push({ entity, id: o.id, data: o.data });
        }
      }
    }
    return c.json({ records, last });
  });

  app.get('/api/stream', auth, (c) => {
    const user = c.get('user');
    let cursor = sinceOf(c.req.query('since'));
    return streamSSE(c, async (stream) => {
      const client = { user };
      clients.add(client);
      // Jedna kolejka: backlog i zmiany na żywo idą po kolei, bez dubli i dziur.
      let q: Promise<void> = Promise.resolve();
      const drain = () => {
        q = q.then(async () => {
          for (;;) {
            const p = page(user, cursor);
            for (const o of p.out) await stream.writeSSE({ event: 'change', id: String(o.seq), data: JSON.stringify(o) });
            cursor = p.last;
            if (!p.more) return;
          }
        }).catch(() => {});
      };
      const bus = changeBusOf(db);
      bus.on('change', drain);
      const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }).catch(() => {}), PING_MS);
      const closed = new Promise<void>((res) => stream.onAbort(res));
      drain();
      await closed;
      clearInterval(ping);
      bus.off('change', drain);
      clients.delete(client);
    });
  });
}
