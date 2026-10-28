import { getTableColumns, isNull, max } from 'drizzle-orm';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import { requireUser, sessionAlive } from './auth.js';
import { logError } from './errors.js';
import { changeBusOf, changesSince, type ChangeRow } from './changes.js';
import { can } from './permissions.js';
import { modulesOf } from './registry.js';
import { changes } from './schema-base.js';

// Rekordy w `changes.after` i w snapshocie to wiersze Drizzle z select() (camelCase wg schematu); moduły przekazują ten kształt do recordChange.
// `by`: kto zmienił (null = system); klient liczy „nowe” tylko ze zmian innych osób.
export type ChangeOut = { seq: number; entity: string; id: string; action: ChangeRow['action']; data: Record<string, unknown> | null; by: string | null };

const PAGE = 500;
const PING_MS = 25_000;

/** Jedyny filtr widoczności (changes, strumień, snapshot). Domyślnie: tylko admin. `before` nigdy nie wychodzi. */
function toOut(app: Hono, deps: AppDeps, user: User, ch: ChangeRow): ChangeOut | null {
  const owner = modulesOf(app).find((m) => m.tables && Object.hasOwn(m.tables, ch.entity));
  const r = owner?.visibleTo ? owner.visibleTo(user, ch, deps) : can(user, 'admin');
  if (!r) return null;
  const v = r === true ? ch : r;
  return { seq: ch.seq, entity: ch.entity, id: ch.entityId, action: v.action, data: v.after, by: ch.userId };
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
    const sid = c.get('sessionId');
    let cursor = Math.max(sinceOf(c.req.query('since')), sinceOf(c.req.header('last-event-id')));
    return streamSSE(c, async (stream) => {
      const client = { user };
      clients.add(client);
      let stop!: () => void;
      const closed = new Promise<void>((res) => (stop = res));
      stream.onAbort(stop);
      // Sesja unieważniona lub użytkownik wyłączony: kończymy, klient zaloguje się ponownie.
      const alive = async () => {
        if (sessionAlive(db, sid)) return true;
        await stream.writeSSE({ event: 'session-expired', data: '' }).catch(() => {});
        stop();
        return false;
      };
      // Jedna kolejka: backlog i zmiany na żywo idą po kolei, bez dubli i dziur.
      let q: Promise<void> = Promise.resolve();
      const drain = () => {
        q = q.then(async () => {
          if (!(await alive())) return;
          for (;;) {
            const p = page(user, cursor);
            for (const o of p.out) await stream.writeSSE({ event: 'change', id: String(o.seq), data: JSON.stringify(o) });
            cursor = p.last;
            if (!p.more) return;
          }
        }).catch((e) => {
          logError(db, 'GET /api/stream', e);
          stop(); // klient połączy się ponownie
        });
      };
      const bus = changeBusOf(db);
      bus.on('change', drain);
      const ping = setInterval(() => {
        q = q.then(async () => { if (await alive()) await stream.writeSSE({ event: 'ping', data: '' }); }).catch(stop);
      }, PING_MS);
      drain();
      await closed;
      clearInterval(ping);
      bus.off('change', drain);
      clients.delete(client);
    });
  });
}
