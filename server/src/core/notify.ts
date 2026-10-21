import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import webpush from 'web-push';
import { z } from 'zod';
import { newId } from '@etner/shared';
import type { AppDeps } from '../app.js';
import { requireUser } from './auth.js';
import { logError } from './errors.js';
import { pushSubscriptions } from './schema-base.js';

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSender = (sub: PushSub, payload: string, opts: { TTL: number }) => Promise<{ statusCode: number }>;
export type Notification = { title: string; body: string; url: string; tag: string };

/** Klucze VAPID z env; w trybie demo (DEMO=1) generowane i zapisane w DATA_DIR. Brak = null (push wyłączony). */
export function vapidFromEnv(env: NodeJS.ProcessEnv, dataDir: string): { publicKey: string; privateKey: string } | null {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) return { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE };
  if (env.DEMO !== '1') return null;
  const file = join(dataDir, 'vapid.json');
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  return JSON.parse(readFileSync(file, 'utf8')) as { publicKey: string; privateKey: string };
}

/** Domyślny nadawca (web-push) dla podanych kluczy VAPID. */
export function webPushSender(vapid: { publicKey: string; privateKey: string }, subject = 'mailto:admin@etner.local'): PushSender {
  return async (sub, payload, opts) => {
    try {
      const r = await webpush.sendNotification(sub, payload, { ...opts, vapidDetails: { subject, ...vapid } });
      return { statusCode: r.statusCode };
    } catch (e) {
      if (e instanceof webpush.WebPushError) return { statusCode: e.statusCode };
      throw e;
    }
  };
}

/** Wysyła powiadomienie do wszystkich urządzeń podanych osób; zwraca liczbę udanych wysyłek. */
export async function notify(deps: AppDeps, userIds: string[], n: Notification): Promise<number> {
  const { push } = deps;
  const ids = [...new Set(userIds)];
  if (!push || !ids.length) return 0; // push wyłączony (brak VAPID)
  const subs = deps.db.select().from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, ids), isNull(pushSubscriptions.deletedAt))).all();
  const payload = JSON.stringify(n);
  let ok = 0;
  for (const s of subs) {
    try {
      const { statusCode } = await push({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      if (statusCode === 404 || statusCode === 410) {
        const now = new Date().toISOString();
        deps.db.update(pushSubscriptions).set({ deletedAt: now, updatedAt: now }).where(eq(pushSubscriptions.id, s.id)).run();
      } else if (statusCode >= 200 && statusCode < 300) ok++;
      else logError(deps.db, 'push', new Error(`Kod ${statusCode} dla ${s.endpoint}`), s.userId);
    } catch (e) {
      logError(deps.db, 'push', e, s.userId);
    }
  }
  return ok;
}

const subscribeBody = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  device: z.string().optional(),
});
const unsubscribeBody = z.object({ endpoint: z.string().min(1) });

export function mountPush(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  app.get('/api/push/key', (c) => c.json({ key: deps.vapidPublic ?? null }));

  app.post('/api/push/subscribe', requireUser(db), async (c) => {
    const b = subscribeBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'Nieprawidłowa subskrypcja' }, 400);
    const { endpoint, keys, device } = b.data;
    const now = new Date().toISOString();
    const userId = c.get('user').id;
    const set = { userId, p256dh: keys.p256dh, auth: keys.auth, device: device ?? null, updatedAt: now, deletedAt: null };
    db.insert(pushSubscriptions).values({ id: newId(), endpoint, createdAt: now, createdBy: userId, ...set })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set }).run();
    return c.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', requireUser(db), async (c) => {
    const b = unsubscribeBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'Nieprawidłowe dane' }, 400);
    const now = new Date().toISOString();
    db.update(pushSubscriptions).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(pushSubscriptions.endpoint, b.data.endpoint), eq(pushSubscriptions.userId, c.get('user').id))).run();
    return c.json({ ok: true });
  });

  // shortcut: limit w pamięci procesu (jedna instancja); przy kilku instancjach przenieść do bazy
  const lastTest = new Map<string, number>();
  app.post('/api/push/test', requireUser(db), async (c) => {
    const id = c.get('user').id, t = (deps.now ?? (() => new Date()))().getTime();
    if (t - (lastTest.get(id) ?? -Infinity) < 10_000) return c.json({ error: 'Poczekaj chwilę przed kolejną próbą.' }, 429);
    lastTest.set(id, t);
    const sent = await notify(deps, [id], { title: '🔔 Próbne powiadomienie', body: 'Powiadomienia działają na tym urządzeniu.', url: '#wiecej', tag: 'test' });
    return c.json({ sent });
  });
}
