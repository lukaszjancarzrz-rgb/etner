import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Hono, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { newId, type Me, type User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import type { Db } from './db.js';
import { recentErrors } from './errors.js';
import { can } from './permissions.js';
import { sessions, users } from './schema-base.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    sessionId: string;
  }
}

const COOKIE = 'etner_s';
const DAY = 86_400_000;
const MAX_AGE_S = 180 * 24 * 3600;

export const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex');

const toUser = (r: typeof users.$inferSelect): User => ({
  id: r.id, name: r.name, role: r.role, perms: r.perms, ekipa: r.ekipa, scheduleCol: r.scheduleCol, active: r.active,
});
const toMe = (u: User): Me => ({ id: u.id, name: u.name, role: u.role, perms: u.perms, ekipa: u.ekipa, scheduleCol: u.scheduleCol });

export function revokeUser(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function requireUser(db: Db): MiddlewareHandler {
  return async (c, next) => {
    const tok = getCookie(c, COOKIE);
    const row = tok
      ? db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
          .where(eq(sessions.tokenHash, hashToken(tok))).get()
      : undefined;
    const now = new Date();
    if (!row || row.s.expiresAt <= now.toISOString() || !row.u.active || row.u.deletedAt) {
      return c.json({ error: 'SESJA' }, 401);
    }
    // przesuwamy last_seen najwyżej raz na godzinę
    if (now.getTime() - Date.parse(row.s.lastSeen) > 3_600_000) {
      db.update(sessions).set({ lastSeen: now.toISOString() }).where(eq(sessions.id, row.s.id)).run();
    }
    c.set('user', toUser(row.u));
    c.set('sessionId', row.s.id);
    await next();
  };
}

export function requireAdmin(db: Db): MiddlewareHandler {
  const auth = requireUser(db);
  return (c, next) =>
    auth(c, async () => {
      if (!can(c.get('user'), 'admin')) {
        c.res = c.json({ error: 'BRAK_UPRAWNIEN' }, 403);
        return;
      }
      await next();
    });
}

export function mountAuth(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const secure = deps.secureCookie ?? process.env.NODE_ENV === 'production';

  app.post('/api/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const u = token
      ? db.select().from(users).where(and(eq(users.tokenHash, hashToken(token)), eq(users.active, true))).get()
      : undefined;
    if (!u || u.deletedAt) return c.json({ error: 'ZLY_LINK' }, 401);
    const sessionToken = randomBytes(32).toString('base64url');
    const now = new Date();
    db.insert(sessions).values({
      id: newId(), userId: u.id, tokenHash: hashToken(sessionToken), device: c.req.header('user-agent') ?? null,
      createdAt: now.toISOString(), lastSeen: now.toISOString(), expiresAt: new Date(now.getTime() + 180 * DAY).toISOString(),
    }).run();
    setCookie(c, COOKIE, sessionToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE_S, secure });
    return c.json(toMe(toUser(u)));
  });

  app.post('/api/logout', (c) => {
    const tok = getCookie(c, COOKIE);
    if (tok) db.delete(sessions).where(eq(sessions.tokenHash, hashToken(tok))).run();
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/me', requireUser(db), (c) => c.json(toMe(c.get('user'))));
  app.get('/api/errors', requireAdmin(db), (c) => c.json(recentErrors(db, 200)));
}
