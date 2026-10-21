import { createHash, randomBytes } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import type { Hono, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { loginSchema, newId, ownPasswordSchema, type Me, type User } from '@etner/shared';
import type { AppDeps } from '../app.js';
import type { Db } from './db.js';
import { body } from './body.js';
import { recentErrors } from './errors.js';
import { MAX_PASSWORD, dummyVerify, hashPassword, verifyPassword } from './password.js';
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

const live = (r: { s: typeof sessions.$inferSelect; u: typeof users.$inferSelect }, now: Date) =>
  r.s.expiresAt > now.toISOString() && r.u.active && !r.u.deletedAt;

/** Czy sesja nadal istnieje, nie wygasła, a użytkownik jest aktywny (długie połączenia SSE). */
export function sessionAlive(db: Db, sessionId: string): boolean {
  const row = db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId)).get();
  return !!row && live(row, new Date());
}

export function requireUser(db: Db): MiddlewareHandler {
  return async (c, next) => {
    const tok = getCookie(c, COOKIE);
    const row = tok
      ? db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
          .where(eq(sessions.tokenHash, hashToken(tok))).get()
      : undefined;
    const now = new Date();
    if (!row || !live(row, now)) {
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

  // shortcut: in-memory, single process, max 5000 keys (when full, expired ones are dropped, then new keys get 429) — move to the DB if the app ever runs several processes
  const fails = new Map<string, { n: number; since: number }>();
  const MAX_FAILS = 5, WINDOW = 15 * 60_000, MAX_KEYS = 5000;
  /** Liczy próbę PRZED await, więc równoległe próby nie przeskoczą limitu; false = zablokowane. Udane logowanie kasuje licznik. */
  const attempt = (key: string): boolean => {
    const now = Date.now();
    const f = fails.get(key);
    if (f && now - f.since > WINDOW) fails.delete(key);
    const cur = fails.get(key);
    if (cur) { if (cur.n >= MAX_FAILS) return false; cur.n++; return true; }
    if (fails.size >= MAX_KEYS) {
      for (const [k, v] of fails) if (now - v.since > WINDOW) fails.delete(k);
      if (fails.size >= MAX_KEYS) return false;
    }
    fails.set(key, { n: 1, since: now });
    return true;
  };

  const startSession = (c: Parameters<MiddlewareHandler>[0], userId: string) => {
    // dotychczasowa sesja tej przeglądarki kończy się, żeby nie zostawały osierocone
    const old = getCookie(c, COOKIE);
    if (old) db.delete(sessions).where(eq(sessions.tokenHash, hashToken(old))).run();
    const sessionToken = randomBytes(32).toString('base64url');
    const now = new Date();
    db.insert(sessions).values({
      id: newId(), userId, tokenHash: hashToken(sessionToken), device: c.req.header('user-agent') ?? null,
      createdAt: now.toISOString(), lastSeen: now.toISOString(), expiresAt: new Date(now.getTime() + 180 * DAY).toISOString(),
    }).run();
    setCookie(c, COOKIE, sessionToken, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE_S, secure });
  };

  app.post('/api/login', async (c) => {
    const b = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(b?.login);
    const login = parsed.success ? parsed.data : '';
    const haslo = typeof b?.haslo === 'string' ? b.haslo : '';
    if (!attempt(login)) return c.json({ error: 'ZA_DUZO_PROB' }, 429);
    const u = login && haslo.length <= MAX_PASSWORD ? db.select().from(users).where(eq(users.login, login)).get() : undefined;
    const ok = haslo.length <= MAX_PASSWORD && (u ? await verifyPassword(haslo, u.passwordHash) : await dummyVerify(haslo));
    if (!u || !ok || !u.active || u.deletedAt) return c.json({ error: 'ZLE_DANE' }, 401);
    fails.delete(login);
    startSession(c, u.id);
    return c.json(toMe(toUser(u)));
  });

  app.post('/api/me/haslo', requireUser(db), async (c) => {
    const d = await body(c, ownPasswordSchema);
    const u = db.select().from(users).where(eq(users.id, c.get('user').id)).get()!;
    const key = u.login ?? u.id;
    if (!attempt(key)) return c.json({ error: 'ZA_DUZO_PROB' }, 429);
    if (!(await verifyPassword(d.stare, u.passwordHash))) return c.json({ error: 'ZLE_HASLO' }, 400);
    const passwordHash = await hashPassword(d.nowe);
    fails.delete(key);
    db.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(users.id, u.id)).run();
    db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, c.get('sessionId')))).run();
    return c.json({ ok: true });
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
